import { act, renderHook, waitFor } from "@testing-library/react-native";
import { authApi } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { secureSessionStore } from "@/lib/session-store";

jest.mock("expo-secure-store", () => require("@/test-support/secure-store-mock").secureStoreMock());

jest.mock("@/lib/api", () => ({
  authApi: { requestCode: jest.fn(), signIn: jest.fn(), me: jest.fn(), signOut: jest.fn() },
}));

const user = { id: "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f", email: "an@example.com" };

beforeEach(async () => {
  jest.resetAllMocks();
  await secureSessionStore.delete();
});

// #97 AC 12: the group screen needs to know which member is me.
test("the signed-in state holds the user's id after a restore from GET /me", async () => {
  await secureSessionStore.set("old-token");
  jest.mocked(authApi.me).mockResolvedValue({ ok: true, data: user });

  const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });

  await waitFor(() =>
    expect(result.current.state).toEqual({ kind: "signed-in", email: user.email, userId: user.id }),
  );
});

test("the signed-in state holds the user's id after a sign-in", async () => {
  jest.mocked(authApi.signIn).mockResolvedValue({ ok: true, data: { token: "t0ken", user } });
  const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
  await waitFor(() => expect(result.current.state).toEqual({ kind: "clear" }));

  await act(async () => {
    await result.current.signIn({ email: user.email, code: "123456" });
  });

  expect(result.current.state).toEqual({
    kind: "signed-in",
    email: user.email,
    userId: user.id,
  });
});
