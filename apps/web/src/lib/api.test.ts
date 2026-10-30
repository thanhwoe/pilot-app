import { describe, expect, it, vi } from "vitest";
import { createAuthApi } from "./api";

const user = { id: "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f", email: "an@example.com" };

function fakeFetch(status: number, body?: unknown) {
  return vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: body === undefined ? {} : { "content-type": "application/json" },
      }),
  );
}

describe("createAuthApi", () => {
  it("posts the email to /auth/code and reads 204 as ok", async () => {
    const fetchFn = fakeFetch(204);
    const api = createAuthApi("http://api.test", fetchFn);

    expect(await api.requestCode({ email: "an@example.com" })).toEqual({ ok: true, data: null });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/auth/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "an@example.com" }),
      signal: expect.any(AbortSignal),
    });
  });

  it("parses a sign-in response with the shared schema", async () => {
    const api = createAuthApi("http://api.test", fakeFetch(200, { token: "t0ken", user }));

    expect(await api.signIn({ email: user.email, code: "123456" })).toEqual({
      ok: true,
      data: { token: "t0ken", user },
    });
  });

  it("sends the token as a bearer token to /me", async () => {
    const fetchFn = fakeFetch(200, user);
    const api = createAuthApi("http://api.test", fetchFn);

    expect(await api.me("t0ken")).toEqual({ ok: true, data: user });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/me", {
      headers: { authorization: "Bearer t0ken" },
      signal: expect.any(AbortSignal),
    });
  });

  it("posts to /auth/sign-out with the bearer token", async () => {
    const fetchFn = fakeFetch(204);
    const api = createAuthApi("http://api.test", fetchFn);

    expect(await api.signOut("t0ken")).toEqual({ ok: true, data: null });
    expect(fetchFn).toHaveBeenCalledWith("http://api.test/auth/sign-out", {
      method: "POST",
      headers: { authorization: "Bearer t0ken" },
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    [400, "invalid_request"],
    [401, "invalid_code"],
    [429, "too_many_requests"],
    [401, "unauthorized"],
  ] as const)("reads a %i with %s as that error", async (status, error) => {
    const api = createAuthApi("http://api.test", fakeFetch(status, { error }));

    expect(await api.signIn({ email: user.email, code: "123456" })).toEqual({ ok: false, error });
  });

  it("reads a network failure as unavailable", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const api = createAuthApi("http://api.test", fetchFn);

    expect(await api.requestCode({ email: user.email })).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it.each([
    ["a 500", fakeFetch(500, { message: "boom" })],
    ["a body that breaks the schema", fakeFetch(200, { token: "" })],
  ])("reads %s as unavailable", async (_, fetchFn) => {
    const api = createAuthApi("http://api.test", fetchFn);

    expect(await api.signIn({ email: user.email, code: "123456" })).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it("gives up on an API that never answers, and reads it as unavailable", async () => {
    const hangs = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const api = createAuthApi("http://api.test", hangs, 20);

    expect(await api.requestCode({ email: user.email })).toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});
