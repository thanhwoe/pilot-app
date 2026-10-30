import { describe, expect, it, vi } from "vitest";
import type { AuthApi } from "./api";
import { signInCopy as copy } from "./copy";
import { accountState, changeEmail, signOut, submitCode, submitEmail } from "./flow";

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

describe("submitEmail", () => {
  it("asks for a code and moves to the code step with the normalized email", async () => {
    const api = fakeApi();

    expect(await submitEmail(api, { email: "  An@Example.COM " })).toEqual({
      step: "code",
      email: "an@example.com",
    });
    expect(api.requestCode).toHaveBeenCalledWith({ email: "an@example.com" });
  });

  it("rejects an invalid email without asking the API for a code", async () => {
    const api = fakeApi();

    expect(await submitEmail(api, { email: "not-an-email" })).toEqual({
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

    expect(await submitEmail(api, { email: "an@example.com" })).toEqual({
      step: "email",
      email: "an@example.com",
      error: message,
    });
  });
});

describe("submitCode", () => {
  it("signs in with the email and code and returns the token", async () => {
    const api = fakeApi();

    expect(await submitCode(api, { email: "an@example.com", code: "123456" })).toEqual({
      signedIn: true,
      token: "t0ken",
    });
    expect(api.signIn).toHaveBeenCalledWith({ email: "an@example.com", code: "123456" });
  });

  it.each(["12345", "1234567", "12345a", ""])(
    "rejects the code %j without trying to sign in",
    async (code) => {
      const api = fakeApi();

      expect(await submitCode(api, { email: "an@example.com", code })).toEqual({
        step: "code",
        email: "an@example.com",
        error: copy.codeFormat,
      });
      expect(api.signIn).not.toHaveBeenCalled();
    },
  );

  it("goes back to the email step if the email is not valid", async () => {
    const api = fakeApi();

    expect(await submitCode(api, { email: "nope", code: "123456" })).toEqual({
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

    expect(await submitCode(api, { email: "an@example.com", code: "123456" })).toEqual({
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
  ])(
    "ends the session on the API and clears the stored session after %s",
    async (_, apiSignOut) => {
      const api = fakeApi({ signOut: apiSignOut });
      const clear = vi.fn();

      await signOut(api, "t0ken", clear);

      expect(apiSignOut).toHaveBeenCalledWith("t0ken");
      expect(clear).toHaveBeenCalledOnce();
    },
  );

  it("clears the stored session without calling the API when there is no token", async () => {
    const api = fakeApi();
    const clear = vi.fn();

    await signOut(api, undefined, clear);

    expect(api.signOut).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledOnce();
  });
});

describe("changeEmail", () => {
  it("goes back to the email step with the email filled in", () => {
    expect(changeEmail("an@example.com")).toEqual({
      step: "email",
      email: "an@example.com",
    });
  });

  it("goes back to an empty email step when there is no email", () => {
    expect(changeEmail("")).toEqual({ step: "email", email: "" });
  });
});

describe("accountState", () => {
  it("shows the email when the API accepts the session", () => {
    expect(accountState({ ok: true, data: user })).toEqual({
      kind: "signed-in",
      email: user.email,
    });
  });

  it("clears the session when the API rejects it", () => {
    expect(accountState({ ok: false, error: "unauthorized" })).toEqual({ kind: "clear" });
  });

  it("clears the session when there is no token to ask about", () => {
    expect(accountState(null)).toEqual({ kind: "clear" });
  });

  it("keeps the session, and offers sign-out, when the API can't be reached", () => {
    expect(accountState({ ok: false, error: "unavailable" })).toEqual({ kind: "unavailable" });
  });
});

describe("signInCopy", () => {
  it("is the exact Vietnamese copy from the spec, the same for web and mobile", () => {
    expect({
      ...copy,
      codePrompt: copy.codePrompt("an@example.com"),
      signedInAs: copy.signedInAs("an@example.com"),
    }).toEqual({
      emailHeading: "Đăng nhập",
      sendCode: "Gửi mã",
      codePrompt: "Nhập mã 6 số đã gửi tới an@example.com",
      signIn: "Đăng nhập",
      useAnotherEmail: "Dùng email khác",
      signedInAs: "Đã đăng nhập: an@example.com",
      signOut: "Đăng xuất",
      wrongCode: "Mã không đúng hoặc đã hết hạn. Hãy thử lại hoặc yêu cầu mã mới.",
      invalidEmail: "Email không hợp lệ.",
      codeFormat: "Mã gồm 6 chữ số.",
      tooManyRequests: "Bạn đã yêu cầu quá nhiều mã. Hãy thử lại sau 15 phút.",
      unavailable: "Không kết nối được máy chủ. Hãy thử lại.",
    });
  });
});
