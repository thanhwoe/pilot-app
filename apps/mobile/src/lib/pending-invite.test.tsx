import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { authApi } from "@/lib/api";
import {
  setPendingInvite,
  takePendingInvite,
  useReturnToPendingInvite,
} from "@/lib/pending-invite";
import { SessionProvider, useSession } from "@/lib/session";
import { secureSessionStore } from "@/lib/session-store";

jest.mock("expo-secure-store", () => require("@/test-support/secure-store-mock").secureStoreMock());

jest.mock("@/lib/api", () => ({
  authApi: { requestCode: jest.fn(), signIn: jest.fn(), me: jest.fn(), signOut: jest.fn() },
}));

const user = { id: "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f", email: "an@example.com" };
const token = "A".repeat(43);

/** Something that holds the hook, with a button that signs in, as the sign-in screen does. */
function Probe() {
  const { signIn, signOut } = useSession();
  useReturnToPendingInvite();
  return (
    <>
      <Pressable testID="sign-in" onPress={() => signIn({ email: user.email, code: "123456" })} />
      <Pressable testID="sign-out" onPress={() => signOut()} />
    </>
  );
}

async function renderProbe() {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByTestId("sign-in");
}

beforeEach(async () => {
  jest.resetAllMocks();
  takePendingInvite();
  await secureSessionStore.delete();
  jest.mocked(authApi.signIn).mockResolvedValue({ ok: true, data: { token: "t0ken", user } });
  jest.mocked(authApi.signOut).mockResolvedValue({ ok: true, data: null });
  jest.spyOn(router, "replace").mockImplementation(() => {});
});

// #98 AC 3: the app comes back to the invite only for a token that could be an invite.
describe("setPendingInvite", () => {
  test("keeps a well-formed token and says so", () => {
    expect(setPendingInvite(token)).toBe(true);
    expect(takePendingInvite()).toBe(token);
  });

  test("takes a token once", () => {
    setPendingInvite(token);
    takePendingInvite();

    expect(takePendingInvite()).toBeNull();
  });

  test.each([
    ["short", "short"],
    ["a 44-character token", "A".repeat(44)],
    ["a 42-character token", "A".repeat(42)],
    ["a slash", `${"A".repeat(42)}/`],
    ["a plus", `${"A".repeat(42)}+`],
    ["an equals sign", `${"A".repeat(42)}=`],
    ["an empty string", ""],
    ["undefined", undefined],
    ["a list", [token]],
  ])("refuses %s and keeps nothing", (_what, value) => {
    expect(setPendingInvite(value)).toBe(false);
    expect(takePendingInvite()).toBeNull();
  });

  test("a refused token does not replace one that was kept", () => {
    setPendingInvite(token);
    setPendingInvite("short");

    expect(takePendingInvite()).toBe(token);
  });
});

describe("useReturnToPendingInvite", () => {
  test("goes to the pending invite once the session turns signed in, and forgets it", async () => {
    await renderProbe();
    setPendingInvite(token);
    expect(router.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("sign-in"));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/invite/${token}`));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(takePendingInvite()).toBeNull();
  });

  test("does nothing when no invite is pending", async () => {
    await renderProbe();

    await fireEvent.press(screen.getByTestId("sign-in"));
    await screen.findByTestId("sign-out");
    await act(async () => {});

    expect(router.replace).not.toHaveBeenCalled();
  });

  test("does nothing while the session is signed out", async () => {
    await renderProbe();

    setPendingInvite(token);
    await act(async () => {});

    expect(router.replace).not.toHaveBeenCalled();
    expect(takePendingInvite()).toBe(token);
  });

  test("does nothing while the session is still loading", async () => {
    await secureSessionStore.set("old-token");
    jest.mocked(authApi.me).mockReturnValue(new Promise(() => {}));
    setPendingInvite(token);

    await render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {});

    expect(router.replace).not.toHaveBeenCalled();
    expect(takePendingInvite()).toBe(token);
  });

  test("a later sign-in does not return to the same invite", async () => {
    await renderProbe();
    setPendingInvite(token);
    await fireEvent.press(screen.getByTestId("sign-in"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByTestId("sign-out"));
    await fireEvent.press(await screen.findByTestId("sign-in"));
    await screen.findByTestId("sign-out");
    await act(async () => {});

    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});
