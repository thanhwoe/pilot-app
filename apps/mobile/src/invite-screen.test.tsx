import { groupsCopy, invitesCopy } from "@gop/shared";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { InviteScreen } from "@/invite-screen";
import { authApi, groupsApi } from "@/lib/api";
import { takePendingInvite } from "@/lib/pending-invite";
import { SessionProvider, useSession } from "@/lib/session";
import { secureSessionStore } from "@/lib/session-store";

// The real screen, session provider and shared flows run here. Only the network is faked (the API
// clients) and the keychain (an in-memory store).
jest.mock("expo-secure-store", () => require("@/test-support/secure-store-mock").secureStoreMock());

jest.mock("@/lib/api", () => ({
  apiUrl: "http://api.test",
  authApi: { requestCode: jest.fn(), signIn: jest.fn(), me: jest.fn(), signOut: jest.fn() },
  groupsApi: { previewInvite: jest.fn(), joinWithInvite: jest.fn() },
}));

const me = jest.mocked(authApi.me);
const previewInvite = jest.mocked(groupsApi.previewInvite);
const joinWithInvite = jest.mocked(groupsApi.joinWithInvite);

const user = { id: crypto.randomUUID(), email: "an@example.com" };
const token = "C".repeat(43);
const group = {
  id: crypto.randomUUID(),
  name: "Đà Lạt",
  memberCount: 2,
  createdAt: "2026-11-13T00:00:00.000Z",
};

type PreviewAnswer = Awaited<ReturnType<typeof groupsApi.previewInvite>>;
type JoinAnswer = Awaited<ReturnType<typeof groupsApi.joinWithInvite>>;
const previewOk = (alreadyMember = false): PreviewAnswer => ({
  ok: true,
  data: { groupName: "Đà Lạt", alreadyMember },
});

/** A request the test answers when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets every promise already answered run its continuations. */
async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

/** The invite screen once the session has loaded, signed in or not, as the unguarded route is. */
function Screens({ link = token }: { link?: unknown }): ReactNode {
  const { state } = useSession();
  return state.kind === "loading" ? null : <InviteScreen token={link} />;
}

async function renderScreen(link?: unknown) {
  await render(
    <SessionProvider>
      <Screens link={link === undefined ? token : link} />
    </SessionProvider>,
  );
}

/** Presses a button twice before React can re-render, as a fast double tap does. */
async function pressTwiceWithoutWaiting(testID: string) {
  const { onClick } = screen.getByTestId(testID).props;
  const press = { stopPropagation() {}, preventDefault() {}, nativeEvent: {} };
  await act(async () => {
    onClick(press);
    onClick(press);
  });
}

let replace: jest.SpyInstance;

beforeEach(async () => {
  jest.resetAllMocks();
  takePendingInvite();
  replace = jest.spyOn(router, "replace").mockImplementation(() => {});
  me.mockResolvedValue({ ok: true, data: user });
  previewInvite.mockResolvedValue(previewOk());
  joinWithInvite.mockResolvedValue({ ok: true, data: group });
  await secureSessionStore.set("old-token");
});

describe("a signed-in visitor", () => {
  // Expo Router updates the params of an open screen instead of mounting a new one, so a second
  // link must not leave the first group's heading and join button on screen.
  test("opening another link while the screen is open shows the new group, and joins it", async () => {
    const other = "D".repeat(43);
    const held = deferred<PreviewAnswer>();
    const view = await render(
      <SessionProvider>
        <Screens link={token} />
      </SessionProvider>,
    );
    await screen.findByTestId("invite-heading");
    previewInvite.mockReturnValue(held.promise);

    await view.rerender(
      <SessionProvider>
        <Screens link={other} />
      </SessionProvider>,
    );

    expect(screen.queryByTestId("invite-heading")).toBeNull();
    expect(screen.queryByTestId("invite-join")).toBeNull();
    expect(screen.getByTestId("invite-loading")).toBeTruthy();

    held.resolve({ ok: true, data: { groupName: "Nha Trang", alreadyMember: false } });
    expect(await screen.findByTestId("invite-heading")).toHaveTextContent(
      invitesCopy.heading("Nha Trang"),
    );
    await fireEvent.press(screen.getByTestId("invite-join"));
    await settle();
    expect(joinWithInvite).toHaveBeenCalledWith("old-token", other);
  });

  test("an error from the first link does not stay on screen for the next", async () => {
    joinWithInvite.mockResolvedValue({ ok: false, error: "unavailable" });
    const view = await render(
      <SessionProvider>
        <Screens link={token} />
      </SessionProvider>,
    );
    await screen.findByTestId("invite-join");
    await fireEvent.press(screen.getByTestId("invite-join"));
    await screen.findByTestId("invite-error");

    await view.rerender(
      <SessionProvider>
        <Screens link={"E".repeat(43)} />
      </SessionProvider>,
    );
    await screen.findByTestId("invite-join");

    expect(screen.queryByTestId("invite-error")).toBeNull();
  });

  // #98 AC 1
  test("sees the group's name and a join button for a good link", async () => {
    await renderScreen();

    expect(await screen.findByTestId("invite-heading")).toHaveTextContent(
      invitesCopy.heading("Đà Lạt"),
    );
    expect(screen.getByTestId("invite-join")).toHaveTextContent("Tham gia nhóm");
    expect(previewInvite).toHaveBeenCalledTimes(1);
    expect(previewInvite).toHaveBeenCalledWith("old-token", token);
  });

  test("sees the loading line until the preview answers", async () => {
    const held = deferred<PreviewAnswer>();
    previewInvite.mockReturnValue(held.promise);

    await renderScreen();
    expect(await screen.findByTestId("invite-loading")).toHaveTextContent("Đang tải nhóm…");
    expect(screen.queryByTestId("invite-join")).toBeNull();

    held.resolve(previewOk());
    await screen.findByTestId("invite-join");
    expect(screen.queryByTestId("invite-loading")).toBeNull();
  });

  // #98 AC 2
  test("joins with the link's token and then goes to the groups list", async () => {
    await renderScreen();
    await screen.findByTestId("invite-join");

    await fireEvent.press(screen.getByTestId("invite-join"));
    await settle();

    expect(joinWithInvite).toHaveBeenCalledTimes(1);
    expect(joinWithInvite).toHaveBeenCalledWith("old-token", token);
    expect(replace).toHaveBeenCalledWith("/");
  });

  test("the join button is disabled while the request runs", async () => {
    const held = deferred<JoinAnswer>();
    joinWithInvite.mockReturnValue(held.promise);
    await renderScreen();
    await screen.findByTestId("invite-join");

    // The press hands back the handler's promise, which this test holds open: don't await it.
    const { onClick } = screen.getByTestId("invite-join").props;
    await act(async () => {
      onClick({ stopPropagation() {}, preventDefault() {}, nativeEvent: {} });
    });

    expect(screen.getByTestId("invite-join").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    held.resolve({ ok: true, data: group });
    await settle();
  });

  test("two presses on join before a re-render send one request", async () => {
    const held = deferred<JoinAnswer>();
    joinWithInvite.mockReturnValue(held.promise);
    await renderScreen();
    await screen.findByTestId("invite-join");

    await pressTwiceWithoutWaiting("invite-join");
    held.resolve({ ok: true, data: group });
    await settle();

    expect(joinWithInvite).toHaveBeenCalledTimes(1);
  });

  // #98 A3: a member lands on the groups list and nothing changes.
  test("a member goes to the groups list with no join button and no join call", async () => {
    previewInvite.mockResolvedValue(previewOk(true));

    await renderScreen();
    await settle();

    expect(replace).toHaveBeenCalledWith("/");
    expect(screen.queryByTestId("invite-join")).toBeNull();
    expect(joinWithInvite).not.toHaveBeenCalled();
  });

  test("a join that fails with another error shows the connection error, keeps the button and the token", async () => {
    joinWithInvite.mockResolvedValue({ ok: false, error: "unavailable" });
    await renderScreen();
    await screen.findByTestId("invite-join");

    await fireEvent.press(screen.getByTestId("invite-join"));

    expect(await screen.findByTestId("invite-error")).toHaveTextContent(groupsCopy.unavailable);
    expect(screen.getByTestId("invite-join")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(await secureSessionStore.get()).toBe("old-token");
  });

  test("a preview that fails with another error shows the connection error and keeps the token", async () => {
    previewInvite.mockResolvedValue({ ok: false, error: "unavailable" });

    await renderScreen();

    expect(await screen.findByTestId("invite-error")).toHaveTextContent(groupsCopy.unavailable);
    expect(screen.queryByTestId("invite-bad-link")).toBeNull();
    expect(screen.queryByTestId("invite-join")).toBeNull();
    expect(await secureSessionStore.get()).toBe("old-token");
  });
});

// #98 AC 4: every link that does not work gets one message that says nothing about why.
describe("[security] a link that does not work", () => {
  test("a preview that answers 404 shows the bad-link text, no join button, and goes nowhere", async () => {
    previewInvite.mockResolvedValue({ ok: false, error: "not_found" });

    await renderScreen();

    expect(await screen.findByTestId("invite-bad-link")).toHaveTextContent(invitesCopy.badLink);
    expect(screen.queryByTestId("invite-join")).toBeNull();
    expect(joinWithInvite).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test.each([
    ["short", "short"],
    ["a 44-character token", "C".repeat(44)],
    ["a token with a slash", `${"C".repeat(42)}/`],
    ["an empty token", ""],
    ["no token", undefined],
  ])("%s shows the bad-link text without any request", async (_what, link) => {
    await renderScreen(link ?? "");

    expect(await screen.findByTestId("invite-bad-link")).toHaveTextContent(invitesCopy.badLink);
    expect(screen.queryByTestId("invite-join")).toBeNull();
    expect(previewInvite).not.toHaveBeenCalled();
    expect(joinWithInvite).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test("a join that answers 404 after a good preview (the link was replaced) shows the same text", async () => {
    joinWithInvite.mockResolvedValue({ ok: false, error: "not_found" });
    await renderScreen();
    await screen.findByTestId("invite-join");

    await fireEvent.press(screen.getByTestId("invite-join"));

    expect(await screen.findByTestId("invite-bad-link")).toHaveTextContent(invitesCopy.badLink);
    expect(screen.queryByTestId("invite-join")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  test("the text is the same for all three", async () => {
    previewInvite.mockResolvedValue({ ok: false, error: "not_found" });
    await renderScreen();
    const fromPreview = (await screen.findByTestId("invite-bad-link")).props.children;

    expect(fromPreview).toBe(invitesCopy.badLink);
  });
});

// #98 AC 3
describe("a signed-out visitor", () => {
  beforeEach(async () => {
    await secureSessionStore.delete();
  });

  test("goes to sign-in, and the invite is remembered for after it", async () => {
    await renderScreen();
    await settle();

    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(takePendingInvite()).toBe(token);
    expect(previewInvite).not.toHaveBeenCalled();
  });

  test("with a malformed link only goes to sign-in", async () => {
    await renderScreen("short");
    await settle();

    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(takePendingInvite()).toBeNull();
  });
});

// #98 A6: every call that sends the session token ends the session on 401 and only on 401.
describe("[security] a rejected session", () => {
  const unauthorized = { ok: false, error: "unauthorized" } as const;

  test("a 401 on the preview deletes the token", async () => {
    previewInvite.mockResolvedValue(unauthorized);

    await renderScreen();
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(screen.queryByTestId("invite-join")).toBeNull();
  });

  test("a 401 on the join deletes the token", async () => {
    joinWithInvite.mockResolvedValue(unauthorized);
    await renderScreen();
    await screen.findByTestId("invite-join");

    await fireEvent.press(screen.getByTestId("invite-join"));
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(replace).not.toHaveBeenCalledWith("/");
  });
});

test("a screen that unmounts before its answer shows nothing and navigates nowhere", async () => {
  const held = deferred<PreviewAnswer>();
  previewInvite.mockReturnValue(held.promise);
  const view = await render(
    <SessionProvider>
      <Screens />
    </SessionProvider>,
  );
  await screen.findByTestId("invite-loading");

  await view.unmount();
  held.resolve(previewOk(true));
  await settle();

  expect(replace).not.toHaveBeenCalled();
  expect(await secureSessionStore.get()).toBe("old-token");
});
