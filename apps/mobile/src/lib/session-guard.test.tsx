import { renderHook } from "@testing-library/react-native";
import { authApi } from "@/lib/api";
import { SessionProvider } from "@/lib/session";
import { useSessionGuard } from "@/lib/session-guard";
import { secureSessionStore } from "@/lib/session-store";

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
  authApi: { requestCode: jest.fn(), signIn: jest.fn(), me: jest.fn(), signOut: jest.fn() },
}));

type Answer = { kind: "signed-out" } | { kind: "ok"; value: number };
const isSignedOut = (answer: Answer): answer is { kind: "signed-out" } =>
  answer.kind === "signed-out";

beforeEach(async () => {
  jest.resetAllMocks();
  jest
    .mocked(authApi.me)
    .mockResolvedValue({ ok: true, data: { id: crypto.randomUUID(), email: "an@example.com" } });
  await secureSessionStore.set("old-token");
});

async function renderGuard() {
  return renderHook(() => useSessionGuard(), { wrapper: SessionProvider });
}

// #31 AC 6: a call added later gets the sign-out from the guard, with no 401 handling of its own.
test("a signed-out answer deletes the stored token and returns nothing to show", async () => {
  const { result } = await renderGuard();

  const answer = await result.current(async () => ({ kind: "signed-out" }) as Answer, isSignedOut);

  expect(answer).toBeNull();
  expect(await secureSessionStore.get()).toBeNull();
});

// #31 AC 7: any other answer is handed back and the session is kept.
test("another answer is returned and the token stays", async () => {
  const { result } = await renderGuard();

  const answer = await result.current(
    async () => ({ kind: "ok", value: 3 }) as Answer,
    isSignedOut,
  );

  expect(answer).toEqual({ kind: "ok", value: 3 });
  expect(await secureSessionStore.get()).toBe("old-token");
});

// #31 AC 8: by the time a call that outlived the screen answers, the token may be a new sign-in's.
test("[security] a signed-out answer after the screen is gone expires nothing", async () => {
  const { result, unmount } = await renderGuard();
  let answerLate!: (answer: Answer) => void;
  const pending = result.current(
    () =>
      new Promise<Answer>((resolve) => {
        answerLate = resolve;
      }),
    isSignedOut,
  );

  await unmount();
  await secureSessionStore.set("new-token");
  answerLate({ kind: "signed-out" });

  expect(await pending).toBeNull();
  expect(await secureSessionStore.get()).toBe("new-token");
});
