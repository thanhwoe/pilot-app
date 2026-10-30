import { describe, expect, it, vi } from "vitest";
import type { AuthApi } from "./api";
import { signInCopy as copy } from "./copy";
import { completeSignIn, type SessionStore } from "./session";

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

function fakeStore(token: string | null = null) {
  let stored = token;
  return {
    get: vi.fn(async () => stored),
    set: vi.fn(async (value: string) => {
      stored = value;
    }),
    delete: vi.fn(async () => {
      stored = null;
    }),
  } satisfies SessionStore;
}

describe("completeSignIn", () => {
  it("[security] saves the token in the store and never returns it", async () => {
    const store = fakeStore();

    const outcome = await completeSignIn(fakeApi(), store, {
      email: "an@example.com",
      code: "123456",
    });

    expect(outcome).toEqual({ signedIn: true });
    expect(JSON.stringify(outcome)).not.toContain("t0ken");
    expect(store.set).toHaveBeenCalledExactlyOnceWith("t0ken");
  });

  it.each([
    ["a wrong code", { code: "123456" }, { ok: false as const, error: "invalid_code" as const }],
    [
      "an API that can't be reached",
      { code: "123456" },
      { ok: false as const, error: "unavailable" as const },
    ],
    ["a code that isn't 6 digits", { code: "12345" }, null],
  ])("[security] stores nothing after %s", async (_, values, apiAnswer) => {
    const store = fakeStore();
    const api = apiAnswer ? fakeApi({ signIn: vi.fn(async () => apiAnswer) }) : fakeApi();

    const outcome = await completeSignIn(api, store, { email: "an@example.com", ...values });

    expect(outcome).toMatchObject({ step: "code", email: "an@example.com" });
    expect(store.set).not.toHaveBeenCalled();
  });

  it("shows the wrong-code error when the API rejects the code", async () => {
    const api = fakeApi({
      signIn: vi.fn(async () => ({ ok: false as const, error: "invalid_code" as const })),
    });

    expect(
      await completeSignIn(api, fakeStore(), { email: "an@example.com", code: "123456" }),
    ).toEqual({ step: "code", email: "an@example.com", error: copy.wrongCode });
  });
});
