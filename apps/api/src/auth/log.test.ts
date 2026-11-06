import { Writable } from "node:stream";
import { signInResponseSchema } from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryGroupStore } from "../groups/memory-store";
import { logSignInCode } from "./log-code-sender";
import { createMemoryAuthStore } from "./memory-store";
import { createResendCodeSender } from "./resend-code-sender";

/** Runs a whole sign-in with the real log sender and returns the code, the token and the log. */
async function signInWithLogCaptured() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const app = buildApp({
    pingDb: async () => true,
    corsOrigins: [],
    version: "1.2.3",
    authStore: createMemoryAuthStore(),
    groupStore: createMemoryGroupStore(),
    authSecret: "test-secret-that-is-at-least-32-characters",
    sendSignInCode: logSignInCode,
    logger: { level: "trace", stream },
  });

  await app.inject({ method: "POST", url: "/auth/code", payload: { email: "ana@example.com" } });
  const code = lines
    .map((line) => JSON.parse(line) as { code?: string })
    .find((entry) => entry.code)?.code;
  const res = await app.inject({
    method: "POST",
    url: "/auth/sign-in",
    payload: { email: "ana@example.com", code },
  });
  const { token } = signInResponseSchema.parse(res.json());
  const authorization = `Bearer ${token}`;
  await app.inject({ method: "GET", url: "/me", headers: { authorization } });
  await app.inject({ method: "POST", url: "/auth/sign-out", headers: { authorization } });

  return { code, token, log: lines.join("") };
}

describe("API log during sign-in", () => {
  it("has the sign-in code, since no email is sent yet", async () => {
    const { code, log } = await signInWithLogCaptured();

    expect(code).toMatch(/^\d{6}$/);
    expect(log).toContain(`"code":"${code}"`);
  });

  it("never has the session token", async () => {
    const { token, log } = await signInWithLogCaptured();

    expect(log).not.toContain(token);
  });
});

describe("API log during sign-in with the email sender", () => {
  const apiKey = "re_test_key_123";

  it("has neither the sign-in code nor the key", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const bodies: { text: string }[] = [];
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(init?.body as string) as { text: string });
      return new Response("{}", { status: 200 });
    };
    const app = buildApp({
      pingDb: async () => true,
      corsOrigins: [],
      version: "1.2.3",
      authStore: createMemoryAuthStore(),
      groupStore: createMemoryGroupStore(),
      authSecret: "test-secret-that-is-at-least-32-characters",
      sendSignInCode: createResendCodeSender({ apiKey, fetch }),
      logger: { level: "trace", stream },
    });

    await app.inject({ method: "POST", url: "/auth/code", payload: { email: "ana@example.com" } });
    const code = bodies[0]?.text.match(/^\d{6}$/m)?.[0];
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: "ana@example.com", code },
    });

    expect(code).toMatch(/^\d{6}$/);
    expect(res.statusCode).toBe(200);
    const log = lines.join("");
    expect(log).not.toContain(String(code));
    expect(log).not.toContain(apiKey);
  });
});
