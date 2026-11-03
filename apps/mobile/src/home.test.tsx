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
jest.mock("expo-secure-store", () => {
  const items = new Map<string, string>();
  // Plain functions, not jest.fn: resetAllMocks in beforeEach would wipe their behaviour.
  return {
    getItemAsync: async (key: string) => items.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      items.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      items.delete(key);
    },
  };
});

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
  return { id: crypto.randomUUID(), name, memberCount: 1, createdAt };
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
