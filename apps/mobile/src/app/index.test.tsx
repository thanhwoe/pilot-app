import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { groupsApi } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { secureSessionStore } from "@/lib/session-store";
import Home from "./index";

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
  fetchHealth: jest.fn(async () => ({ status: "ok", db: "ok" })),
  authApi: {
    requestCode: jest.fn(),
    signIn: jest.fn(),
    me: jest.fn(),
    signOut: jest.fn(),
  },
  groupsApi: { listGroups: jest.fn(), createGroup: jest.fn() },
}));

const listGroups = jest.mocked(groupsApi.listGroups);
const createGroup = jest.mocked(groupsApi.createGroup);

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
      <Pressable testID="sign-in" onPress={() => signIn({ email: "an@example.com", code: "1" })} />
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
  const { authApi, fetchHealth } = jest.requireMock("@/lib/api");
  fetchHealth.mockResolvedValue({ status: "ok", db: "ok" });
  authApi.me.mockResolvedValue({ ok: true, data: { email: "an@example.com" } });
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
