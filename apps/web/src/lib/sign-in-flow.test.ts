import { describe, expect, it, vi } from "vitest";
import type { AuthApi } from "./api";
import { copy } from "./copy";
import { signOut, submitCode, submitEmail } from "./sign-in-flow";

const user = { id: "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f", email: "an@example.com" };

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    requestCode: vi.fn(async () => ({ ok: true as const, data: null })),
    signIn: vi.fn(async () => ({ ok: true as const, data: { token: "t0ken", user } })),
    me: vi.fn(async () => ({ ok: true as const, data: user })),
    signOut: vi.fn(async () => ({ ok: true as const, data: null })),
    ...overrides,
  };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

describe("submitEmail", () => {
  it("asks for a code and moves to the code step with the normalized email", async () => {
    const api = fakeApi();

    expect(await submitEmail(api, form({ email: "  An@Example.COM " }))).toEqual({
      step: "code",
      email: "an@example.com",
    });
    expect(api.requestCode).toHaveBeenCalledWith({ email: "an@example.com" });
  });

  it("rejects an invalid email without asking the API for a code", async () => {
    const api = fakeApi();

    expect(await submitEmail(api, form({ email: "not-an-email" }))).toEqual({
      step: "email",
      email: "not-an-email",
      error: copy.invalidEmail,
    });
    expect(api.requestCode).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_request", copy.invalidEmail],
    ["too_many_requests", copy.tooManyRequests],
    ["unavailable", copy.unavailable],
  ] as const)("stays on the email step when the API answers %s", async (error, message) => {
    const api = fakeApi({ requestCode: vi.fn(async () => ({ ok: false as const, error })) });

    expect(await submitEmail(api, form({ email: "an@example.com" }))).toEqual({
      step: "email",
      email: "an@example.com",
      error: message,
    });
  });
});

describe("submitCode", () => {
  it("signs in with the email and code and returns the token", async () => {
    const api = fakeApi();

    expect(await submitCode(api, form({ email: "an@example.com", code: "123456" }))).toEqual({
      signedIn: true,
      token: "t0ken",
    });
    expect(api.signIn).toHaveBeenCalledWith({ email: "an@example.com", code: "123456" });
  });

  it.each(["12345", "1234567", "12345a", ""])(
    "rejects the code %j without trying to sign in",
    async (code) => {
      const api = fakeApi();

      expect(await submitCode(api, form({ email: "an@example.com", code }))).toEqual({
        step: "code",
        email: "an@example.com",
        error: copy.codeFormat,
      });
      expect(api.signIn).not.toHaveBeenCalled();
    },
  );

  it("goes back to the email step if the email is not valid", async () => {
    const api = fakeApi();

    expect(await submitCode(api, form({ email: "nope", code: "123456" }))).toEqual({
      step: "email",
      email: "nope",
      error: copy.invalidEmail,
    });
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_code", copy.wrongCode],
    ["invalid_request", copy.codeFormat],
    ["unavailable", copy.unavailable],
  ] as const)("stays on the code step when the API answers %s", async (error, message) => {
    const api = fakeApi({ signIn: vi.fn(async () => ({ ok: false as const, error })) });

    expect(await submitCode(api, form({ email: "an@example.com", code: "123456" }))).toEqual({
      step: "code",
      email: "an@example.com",
      error: message,
    });
  });
});

describe("signOut", () => {
  it.each([
    ["204", vi.fn(async () => ({ ok: true as const, data: null }))],
    ["401", vi.fn(async () => ({ ok: false as const, error: "unauthorized" as const }))],
    [
      "a thrown error",
      vi.fn(async () => {
        throw new Error("API down");
      }),
    ],
  ])("ends the session on the API and clears the cookie after %s", async (_, apiSignOut) => {
    const api = fakeApi({ signOut: apiSignOut });
    const clearCookie = vi.fn();

    await signOut(api, "t0ken", clearCookie);

    expect(apiSignOut).toHaveBeenCalledWith("t0ken");
    expect(clearCookie).toHaveBeenCalledOnce();
  });

  it("clears the cookie without calling the API when there is no token", async () => {
    const api = fakeApi();
    const clearCookie = vi.fn();

    await signOut(api, undefined, clearCookie);

    expect(api.signOut).not.toHaveBeenCalled();
    expect(clearCookie).toHaveBeenCalledOnce();
  });
});
