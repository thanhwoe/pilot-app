import { codeExpiresAt, errorResponseSchema, sessionExpiresAt } from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryAuthStore } from "./memory-store";
import { hashSecret } from "./secrets";

const authSecret = "test-secret-that-is-at-least-32-characters";
const minute = 60_000;

/** An app on the in-memory store, with a clock the test moves and a sender that records codes. */
function setup() {
  const authStore = createMemoryAuthStore();
  const sent: { email: string; code: string }[] = [];
  let now = new Date("2026-10-29T10:00:00Z");
  const app = buildApp({
    pingDb: async () => true,
    corsOrigins: [],
    version: "1.2.3",
    authStore,
    authSecret,
    sendSignInCode: async (email, code) => {
      sent.push({ email, code });
    },
    now: () => now,
  });

  return {
    app,
    authStore,
    sent,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    requestCode(email: unknown) {
      return app.inject({ method: "POST", url: "/auth/code", payload: { email } });
    },
  };
}

describe("POST /auth/code", () => {
  it("answers 204 and sends a 6-digit code for the email", async () => {
    const { requestCode, sent } = setup();

    const res = await requestCode("ana@example.com");

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(sent).toEqual([{ email: "ana@example.com", code: expect.stringMatching(/^\d{6}$/) }]);
  });

  it("sends the code for the trimmed, lower-cased email", async () => {
    const { requestCode, sent } = setup();

    await requestCode("  Ana@Example.COM ");

    expect(sent[0]?.email).toBe("ana@example.com");
  });

  it.each([["not-an-email"], [""], [42], [undefined]])(
    "answers 400 for the email %j and sends nothing",
    async (email) => {
      const { requestCode, sent, authStore } = setup();

      const res = await requestCode(email);

      expect(res.statusCode).toBe(400);
      expect(errorResponseSchema.parse(res.json())).toEqual({ error: "invalid_request" });
      expect(sent).toEqual([]);
      expect(await authStore.countCodesSince(String(email), new Date(0))).toBe(0);
    },
  );

  it("answers 400 for an email longer than 254 characters", async () => {
    const { requestCode } = setup();

    const res = await requestCode(`${"a".repeat(64)}@${"b".repeat(186)}.com`);

    expect(res.statusCode).toBe(400);
  });

  it("answers 429 to the 6th request in 15 minutes and sends no code", async () => {
    const { requestCode, sent, advance } = setup();
    for (let request = 0; request < 5; request++) {
      expect((await requestCode("ana@example.com")).statusCode).toBe(204);
      advance(minute);
    }

    const res = await requestCode("ana@example.com");

    expect(res.statusCode).toBe(429);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "too_many_requests" });
    expect(sent).toHaveLength(5);

    advance(11 * minute);
    expect((await requestCode("ana@example.com")).statusCode).toBe(204);
  });

  it("answers the same for an email with an account and one without", async () => {
    const { requestCode, authStore } = setup();
    const createdAt = new Date("2026-10-29T09:00:00Z");
    await authStore.saveCode({
      email: "known@example.com",
      codeHash: hashSecret("111111", authSecret),
      createdAt,
      expiresAt: codeExpiresAt(createdAt),
    });
    await authStore.signInWithCode({
      email: "known@example.com",
      codeHash: hashSecret("111111", authSecret),
      now: createdAt,
      session: { tokenHash: "t", createdAt, expiresAt: sessionExpiresAt(createdAt) },
    });

    const known = await requestCode("known@example.com");
    const unknown = await requestCode("unknown@example.com");

    expect([known.statusCode, known.body]).toEqual([204, ""]);
    expect([unknown.statusCode, unknown.body]).toEqual([204, ""]);
  });
});
