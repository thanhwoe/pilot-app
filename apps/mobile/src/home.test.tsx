import { groupsCopy } from "@gop/shared";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import Home from "@/app/index";
import { authApi, fetchHealth, groupsApi } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { secureSessionStore } from "@/lib/session-store";

// The real home screen, session provider and shared flows run here. Only the network is faked
// (the API clients) and the keychain (an in-memory store).
jest.mock("expo-secure-store", () => require("@/test-support/secure-store-mock").secureStoreMock());

jest.mock("@/lib/api", () => ({
  apiUrl: "http://api.test",
  fetchHealth: jest.fn(async () => ({ status: "ok", db: "up", version: "test" })),
  authApi: {
    requestCode: jest.fn(),
    signIn: jest.fn(),
    me: jest.fn(),
    signOut: jest.fn(),
  },
  groupsApi: { listGroups: jest.fn(), createGroup: jest.fn() },
}));

const me = jest.mocked(authApi.me);
const signInApi = jest.mocked(authApi.signIn);
const signOutApi = jest.mocked(authApi.signOut);
const listGroups = jest.mocked(groupsApi.listGroups);
const createGroup = jest.mocked(groupsApi.createGroup);

const user = { id: crypto.randomUUID(), email: "an@example.com" };

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

function group(name: string, createdAt: string) {
  return { id: crypto.randomUUID(), name, memberCount: 1, createdAt, hasInvite: false };
}

/** Home while a session exists; otherwise a stand-in for the sign-in screen. */
function Screens(): ReactNode {
  const { state, signIn } = useSession();
  if (state.kind === "loading") {
    return null;
  }
  if (state.kind === "clear") {
    return (
      <Pressable
        testID="sign-in"
        onPress={() => signIn({ email: "an@example.com", code: "123456" })}
      />
    );
  }
  return <Home />;
}

async function renderApp() {
  await render(
    <SessionProvider>
      <Screens />
    </SessionProvider>,
  );
}

beforeEach(async () => {
  jest.resetAllMocks();
  jest.mocked(fetchHealth).mockResolvedValue({ status: "ok", db: "up", version: "test" });
  me.mockResolvedValue({ ok: true, data: user });
  signOutApi.mockResolvedValue({ ok: true, data: null });
  signInApi.mockResolvedValue({ ok: true, data: { token: "new-token", user } });
  await secureSessionStore.set("old-token");
});

// #23 AC 2: after a failed first load, a create reloads the list instead of showing only the new
// group.
test("a create after a failed first load lists the new group and the others", async () => {
  const existing = group("Nha", "2026-11-01T00:00:00.000Z");
  const created = group("Da Lat", "2026-11-02T00:00:00.000Z");
  listGroups
    .mockResolvedValueOnce({ ok: false, error: "unavailable" })
    .mockResolvedValueOnce({ ok: true, data: { groups: [created, existing] } });
  createGroup.mockResolvedValue({ ok: true, data: created });

  await renderApp();
  await screen.findByTestId("groups-error");

  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Da Lat");
  await fireEvent.press(screen.getByTestId("create-group"));

  await screen.findByText("Nha");
  expect(screen.getAllByTestId("group-name").map((node) => node.props.children)).toEqual([
    "Da Lat",
    "Nha",
  ]);
  expect(listGroups).toHaveBeenCalledTimes(2);
});

/**
 * fireEvent.press hands back the handler's promise, so awaiting it waits for the create this test
 * holds open, and not awaiting it leaves React's act scope overlapping. The press reaches the
 * button as an `onClick` on its native view, which this calls inside its own act.
 */
async function tapWithoutWaiting(testID: string) {
  const { onClick } = screen.getByTestId(testID).props;
  await act(async () => {
    onClick({ stopPropagation() {}, preventDefault() {}, nativeEvent: {} });
  });
}

/** Signs out on the home screen, then signs in again on the stand-in sign-in screen. */
async function signOutAndSignInAgain() {
  await fireEvent.press(screen.getByTestId("sign-out"));
  await fireEvent.press(await screen.findByTestId("sign-in"));
  await screen.findByTestId("signed-in-email");
  expect(await secureSessionStore.get()).toBe("new-token");
}

// #23 AC 3: a request that outlived the home screen must not expire the next sign-in.
test("a groups list still pending at sign-out answers 401 after the next sign-in", async () => {
  const late = deferred<Awaited<ReturnType<typeof groupsApi.listGroups>>>();
  listGroups
    .mockReturnValueOnce(late.promise)
    .mockResolvedValueOnce({ ok: true, data: { groups: [] } });

  await renderApp();
  await screen.findByTestId("signed-in-email");
  await signOutAndSignInAgain();

  late.resolve({ ok: false, error: "unauthorized" });
  await settle();

  expect(await secureSessionStore.get()).toBe("new-token");
  expect(screen.getByTestId("signed-in-email")).toBeTruthy();
});

test("a group create still pending at sign-out answers 401 after the next sign-in", async () => {
  const late = deferred<Awaited<ReturnType<typeof groupsApi.createGroup>>>();
  listGroups.mockResolvedValue({ ok: true, data: { groups: [] } });
  createGroup.mockReturnValueOnce(late.promise);

  await renderApp();
  await screen.findByTestId("groups-empty");
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Da Lat");
  await tapWithoutWaiting("create-group");
  expect(createGroup).toHaveBeenCalledTimes(1);
  await signOutAndSignInAgain();

  late.resolve({ ok: false, error: "unauthorized" });
  await settle();

  expect(await secureSessionStore.get()).toBe("new-token");
  expect(screen.getByTestId("signed-in-email")).toBeTruthy();
});

// #23 AC 1: a double tap creates one group. Both presses land before React re-renders, so the
// `disabled` button can't stop the second one; only the `inFlight` guard can. Maestro taps too
// slowly to reach this (see groups-double-tap.yaml).
test("two presses on create before a re-render create one group", async () => {
  const held = deferred<Awaited<ReturnType<typeof groupsApi.createGroup>>>();
  listGroups.mockResolvedValue({ ok: true, data: { groups: [] } });
  createGroup.mockReturnValue(held.promise);

  await renderApp();
  await screen.findByTestId("groups-empty");
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Hoi An");
  const { onClick } = screen.getByTestId("create-group").props;
  const press = { stopPropagation() {}, preventDefault() {}, nativeEvent: {} };
  await act(async () => {
    onClick(press);
    onClick(press);
  });
  held.resolve({ ok: true, data: group("Hoi An", "2026-11-03T00:00:00.000Z") });
  await settle();

  expect(createGroup).toHaveBeenCalledTimes(1);
  expect(screen.getAllByTestId("group-name").map((node) => node.props.children)).toEqual([
    "Hoi An",
  ]);
});

// #31 AC 6: a 401 on any call shows sign-in and deletes the token, instead of a retry message.
test("[security] a 401 on the groups list deletes the token and shows sign-in", async () => {
  listGroups.mockResolvedValue({ ok: false, error: "unauthorized" });

  await renderApp();

  await screen.findByTestId("sign-in");
  expect(await secureSessionStore.get()).toBeNull();
});

test("[security] a 401 on a group create deletes the token and shows sign-in", async () => {
  listGroups.mockResolvedValue({ ok: true, data: { groups: [] } });
  createGroup.mockResolvedValue({ ok: false, error: "unauthorized" });

  await renderApp();
  await screen.findByTestId("groups-empty");
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Da Lat");
  await fireEvent.press(screen.getByTestId("create-group"));

  await screen.findByTestId("sign-in");
  expect(await secureSessionStore.get()).toBeNull();
});

// #31 AC 7: a failure that isn't a rejected session shows the connection error and keeps the token.
test("[security] a groups list that fails shows the connection error and keeps the token", async () => {
  listGroups.mockResolvedValue({ ok: false, error: "unavailable" });

  await renderApp();

  expect((await screen.findByTestId("groups-error")).props.children).toBe(groupsCopy.unavailable);
  expect(await secureSessionStore.get()).toBe("old-token");
});

test.each(["unavailable", "not_found", "too_many_requests"] as const)(
  "[security] a group create answering %s shows the error and keeps the token",
  async (error) => {
    listGroups.mockResolvedValue({ ok: true, data: { groups: [] } });
    createGroup.mockResolvedValue({ ok: false, error });

    await renderApp();
    await screen.findByTestId("groups-empty");
    await fireEvent.changeText(screen.getByTestId("group-name-input"), "Da Lat");
    await fireEvent.press(screen.getByTestId("create-group"));

    expect((await screen.findByTestId("group-form-error")).props.children).toBe(
      groupsCopy.unavailable,
    );
    expect(await secureSessionStore.get()).toBe("old-token");
  },
);

// #21 AC 1: while the first load is pending, the list area says so.
test("the list area shows the loading line while the first load is pending", async () => {
  const held = deferred<Awaited<ReturnType<typeof groupsApi.listGroups>>>();
  listGroups.mockReturnValue(held.promise);

  await renderApp();
  await screen.findByTestId("signed-in-email");

  expect(screen.getByTestId("groups-loading").props.children).toBe("Đang tải nhóm…");
  expect(screen.queryByTestId("groups-empty")).toBeNull();
  expect(screen.queryByTestId("groups-error")).toBeNull();

  held.resolve({ ok: true, data: { groups: [] } });
  await screen.findByTestId("groups-empty");
  expect(screen.queryByTestId("groups-loading")).toBeNull();
});

type ListAnswer = Awaited<ReturnType<typeof groupsApi.listGroups>>;
const unavailable: ListAnswer = { ok: false, error: "unavailable" };

/** Presses a button twice before React can re-render, as a fast double tap does. */
async function pressTwiceWithoutWaiting(testID: string) {
  const { onClick } = screen.getByTestId(testID).props;
  const press = { stopPropagation() {}, preventDefault() {}, nativeEvent: {} };
  await act(async () => {
    onClick(press);
    onClick(press);
  });
}

// #21 AC 2: a failed first load offers a retry under the connection error.
test("a failed first load shows the connection error with a retry button", async () => {
  listGroups.mockResolvedValue(unavailable);

  await renderApp();
  await screen.findByTestId("groups-error");

  expect(screen.getByTestId("groups-retry")).toBeTruthy();
  expect(screen.getByText("Thử lại")).toBeTruthy();
  expect(screen.queryByTestId("groups-loading")).toBeNull();
});

// #21 AC 3: a retry shows the loading line in place of the error, then the list or the empty state.
test.each([
  ["my groups", [group("Nha", "2026-11-01T00:00:00.000Z")]],
  ["the empty state", []],
])("a retry with the API back shows the loading line, then %s", async (_name, groups) => {
  const held = deferred<ListAnswer>();
  listGroups.mockResolvedValueOnce(unavailable).mockReturnValueOnce(held.promise);

  await renderApp();
  await screen.findByTestId("groups-error");
  await tapWithoutWaiting("groups-retry");

  expect(screen.getByTestId("groups-loading").props.children).toBe("Đang tải nhóm…");
  expect(screen.queryByTestId("groups-error")).toBeNull();
  expect(screen.queryByTestId("groups-retry")).toBeNull();

  held.resolve({ ok: true, data: { groups } });
  await settle();

  expect(screen.queryByTestId("groups-loading")).toBeNull();
  expect(screen.queryByTestId("groups-error")).toBeNull();
  expect(screen.queryByTestId("groups-retry")).toBeNull();
  if (groups.length === 0) {
    expect(screen.getByTestId("groups-empty")).toBeTruthy();
  } else {
    expect(screen.getAllByTestId("group-name").map((node) => node.props.children)).toEqual(["Nha"]);
  }
});

// #21 AC 4: a retry with the API still down brings the error and the button back.
test("a retry with the API still down shows the connection error and the retry button again", async () => {
  listGroups.mockResolvedValue(unavailable);

  await renderApp();
  await screen.findByTestId("groups-error");
  await fireEvent.press(screen.getByTestId("groups-retry"));
  await screen.findByTestId("groups-error");

  expect(screen.getByTestId("groups-retry")).toBeTruthy();
  expect(screen.queryByTestId("groups-loading")).toBeNull();
  expect(listGroups).toHaveBeenCalledTimes(2);
});

// #21 AC 6: a list that loaded fine has no retry button and loads once.
test("a list that loaded fine has no retry button", async () => {
  listGroups.mockResolvedValue({
    ok: true,
    data: { groups: [group("Nha", "2026-11-01T00:00:00.000Z")] },
  });

  await renderApp();
  await screen.findByText("Nha");

  expect(screen.queryByTestId("groups-retry")).toBeNull();
  expect(screen.queryByTestId("groups-loading")).toBeNull();
  expect(listGroups).toHaveBeenCalledTimes(1);
});

// #21 A4: two presses before a re-render send one request. The button is only gone from the next
// render, so only a guard can stop the second press.
test("two presses on retry before a re-render send one list request", async () => {
  const held = deferred<ListAnswer>();
  listGroups.mockResolvedValueOnce(unavailable).mockReturnValueOnce(held.promise);

  await renderApp();
  await screen.findByTestId("groups-error");
  await pressTwiceWithoutWaiting("groups-retry");

  expect(listGroups).toHaveBeenCalledTimes(2);

  held.resolve({ ok: true, data: { groups: [] } });
  await settle();
});

// #21 AC 5 [security]: a retry the API answers with 401 ends the session on this device.
test("[security] a retry the API rejects with 401 deletes the token and shows sign-in", async () => {
  listGroups
    .mockResolvedValueOnce(unavailable)
    .mockResolvedValueOnce({ ok: false, error: "unauthorized" });

  await renderApp();
  await screen.findByTestId("groups-error");
  await fireEvent.press(screen.getByTestId("groups-retry"));

  await screen.findByTestId("sign-in");
  expect(await secureSessionStore.get()).toBeNull();
  expect(screen.queryByTestId("groups-error")).toBeNull();
});

// #21 A6 [security]: a retry still pending at sign-out must not expire the next sign-in.
test("[security] a retry pending at sign-out answers 401 after the next sign-in", async () => {
  const late = deferred<ListAnswer>();
  listGroups
    .mockResolvedValueOnce(unavailable)
    .mockReturnValueOnce(late.promise)
    .mockResolvedValueOnce({ ok: true, data: { groups: [] } });

  await renderApp();
  await screen.findByTestId("groups-error");
  await tapWithoutWaiting("groups-retry");
  await signOutAndSignInAgain();

  late.resolve({ ok: false, error: "unauthorized" });
  await settle();

  expect(await secureSessionStore.get()).toBe("new-token");
  expect(screen.getByTestId("signed-in-email")).toBeTruthy();
});

// #21 A5: when two loads overlap, the one that started last is the one shown.
test("a retry's older answer doesn't overwrite the list a create reloaded", async () => {
  const existing = group("Nha", "2026-11-01T00:00:00.000Z");
  const created = group("Da Lat", "2026-11-02T00:00:00.000Z");
  const older = deferred<ListAnswer>();
  listGroups
    .mockResolvedValueOnce(unavailable)
    .mockReturnValueOnce(older.promise)
    .mockResolvedValueOnce({ ok: true, data: { groups: [created, existing] } });
  createGroup.mockResolvedValue({ ok: true, data: created });

  await renderApp();
  await screen.findByTestId("groups-error");
  await tapWithoutWaiting("groups-retry");
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Da Lat");
  await fireEvent.press(screen.getByTestId("create-group"));
  await screen.findByText("Da Lat");

  older.resolve({ ok: true, data: { groups: [existing] } });
  await settle();

  expect(screen.getAllByTestId("group-name").map((node) => node.props.children)).toEqual([
    "Da Lat",
    "Nha",
  ]);
});

// #21 A7: the create form works while the first load is still pending.
test("a group can be created while the first load is pending", async () => {
  const created = group("Da Lat", "2026-11-02T00:00:00.000Z");
  const first = deferred<ListAnswer>();
  listGroups
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ ok: true, data: { groups: [created] } });
  createGroup.mockResolvedValue({ ok: true, data: created });

  await renderApp();
  await screen.findByTestId("groups-loading");
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Da Lat");
  await fireEvent.press(screen.getByTestId("create-group"));
  await screen.findByText("Da Lat");

  expect(createGroup).toHaveBeenCalledTimes(1);
  first.resolve({ ok: true, data: { groups: [] } });
  await settle();
});

// #21 review: a create whose reload answers 401 waits for the sign-out, so the button stays
// disabled until the token is gone and a second create can't start meanwhile.
test("[security] a create whose reload answers 401 stays busy until the token is deleted", async () => {
  const created = group("Da Lat", "2026-11-02T00:00:00.000Z");
  const tokenDeleted = deferred<void>();
  // The token deletion waits for the test; it then deletes for real.
  const deleteToken = secureSessionStore.delete;
  const holdDelete = jest.spyOn(secureSessionStore, "delete").mockImplementation(async () => {
    await tokenDeleted.promise;
    await deleteToken();
  });
  listGroups
    .mockResolvedValueOnce(unavailable)
    .mockResolvedValueOnce({ ok: false, error: "unauthorized" });
  createGroup.mockResolvedValue({ ok: true, data: created });

  try {
    await renderApp();
    await screen.findByTestId("groups-error");
    await fireEvent.changeText(screen.getByTestId("group-name-input"), "Da Lat");
    await tapWithoutWaiting("create-group");
    await settle();

    expect(listGroups).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("create-group").props.accessibilityState.disabled).toBe(true);

    tokenDeleted.resolve();
    await screen.findByTestId("sign-in");
    expect(await secureSessionStore.get()).toBeNull();
  } finally {
    holdDelete.mockRestore();
  }
});
