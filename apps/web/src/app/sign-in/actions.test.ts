import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { signInAction } from "./actions";

const cookieStore = { set: vi.fn() };
const signIn = vi.fn();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/api", () => ({
  authApi: () => ({ requestCode: vi.fn(), signIn, me: vi.fn(), signOut: vi.fn() }),
  groupsApi: vi.fn(),
}));

const token = "Ab3-_".repeat(8) + "xyz";

/** The code step of the sign-in form, with a `next` field if one is given. */
function codeStep(next?: string) {
  const form = new FormData();
  form.set("step", "code");
  form.set("email", "an@example.com");
  form.set("code", "123456");
  if (next !== undefined) {
    form.set("next", next);
  }
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn.mockResolvedValue({
    ok: true,
    data: { token: "session-token", user: { id: crypto.randomUUID(), email: "an@example.com" } },
  });
});

describe("signInAction after the code is accepted", () => {
  it("#94 AC 4: goes to the invite the visitor came from", async () => {
    await expect(
      signInAction({ step: "code", email: "an@example.com" }, codeStep(`/invite/${token}`)),
    ).rejects.toThrow(`redirect:/invite/${token}`);

    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE,
      "session-token",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it.each([
    ["no next field", undefined],
    ["an empty next field", ""],
    ["an absolute address", "https://example.com"],
    ["a protocol-relative address", "//example.com"],
    ["a page of this site that is not an invite", "/sign-in"],
    ["an invite path with extra path", `/invite/${token}/x`],
  ])("#94 AC 4: goes to the groups list for %s", async (_name, next) => {
    await expect(
      signInAction({ step: "code", email: "an@example.com" }, codeStep(next)),
    ).rejects.toThrow("redirect:/");
  });

  it("#94 AC 4: does not redirect, and sets no cookie, when the code is wrong", async () => {
    signIn.mockResolvedValue({ ok: false, error: "invalid_code" });

    const state = await signInAction(
      { step: "code", email: "an@example.com" },
      codeStep(`/invite/${token}`),
    );

    expect(state).toMatchObject({ step: "code", email: "an@example.com" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
