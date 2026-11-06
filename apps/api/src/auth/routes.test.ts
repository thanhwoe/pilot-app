import { Writable } from "node:stream";
import {
  errorResponseSchema,
  meResponseSchema,
  sessionExpiresAt,
  signInResponseSchema,
} from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryGroupStore } from "../groups/memory-store";
import { createMemoryAuthStore } from "./memory-store";
import { createResendCodeSender } from "./resend-code-sender";
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
    groupStore: createMemoryGroupStore(),
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
    signIn(email: unknown, code: unknown) {
      return app.inject({ method: "POST", url: "/auth/sign-in", payload: { email, code } });
    },
    me(authorization?: string) {
      return app.inject({
        method: "GET",
        url: "/me",
        headers: authorization ? { authorization } : {},
      });
    },
    signOut(authorization?: string) {
      return app.inject({
        method: "POST",
        url: "/auth/sign-out",
        headers: authorization ? { authorization } : {},
      });
    },
    /** Asks for a code a second after the last request, and returns the code the sender got. */
    async codeFor(email: string) {
      now = new Date(now.getTime() + 1000);
      await app.inject({ method: "POST", url: "/auth/code", payload: { email } });
      const code = sent.at(-1)?.code;
      if (!code) {
        throw new Error("No code was sent");
      }
      return code;
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

  it("answers 429 beyond 5 codes even when requests arrive together", async () => {
    const { requestCode, sent } = setup();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => requestCode("ana@example.com")),
    );

    expect(responses.map((res) => res.statusCode).sort()).toEqual([
      ...Array(5).fill(204),
      ...Array(5).fill(429),
    ]);
    expect(sent).toHaveLength(5);
  });

  it("answers the same for an email with an account and one without", async () => {
    const { requestCode, authStore } = setup();
    const createdAt = new Date("2026-10-29T09:00:00Z");
    await authStore.issueCode({
      email: "known@example.com",
      codeHash: hashSecret("111111", authSecret),
      now: createdAt,
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

/** A 6-digit code that is not `code`. */
const otherThan = (code: string) => (code === "000000" ? "111111" : "000000");

describe("POST /auth/sign-in", () => {
  it("signs in with the code and creates the account the first time", async () => {
    const { codeFor, signIn } = setup();
    const code = await codeFor("ana@example.com");

    const res = await signIn("ana@example.com", code);

    expect(res.statusCode).toBe(200);
    const body = signInResponseSchema.parse(res.json());
    expect(body.user.email).toBe("ana@example.com");
    expect(body.token.length).toBeGreaterThanOrEqual(43);
  });

  it("signs in to the same account the next time", async () => {
    const { codeFor, signIn } = setup();
    const first = signInResponseSchema.parse(
      (await signIn("ana@example.com", await codeFor("ana@example.com"))).json(),
    );

    const second = signInResponseSchema.parse(
      (await signIn("ana@example.com", await codeFor("ana@example.com"))).json(),
    );

    expect(second.user).toEqual(first.user);
    expect(second.token).not.toBe(first.token);
  });

  it("treats an email with spaces and capitals as the same account", async () => {
    const { codeFor, signIn } = setup();
    const first = signInResponseSchema.parse(
      (await signIn("ana@example.com", await codeFor("ana@example.com"))).json(),
    );

    const code = await codeFor("  ANA@Example.com ");
    const second = signInResponseSchema.parse((await signIn(" Ana@EXAMPLE.com", code)).json());

    expect(second.user).toEqual(first.user);
  });

  it("answers 401 to a code that does not match", async () => {
    const { codeFor, signIn } = setup();
    const code = await codeFor("ana@example.com");

    const res = await signIn("ana@example.com", otherThan(code));

    expect(res.statusCode).toBe(401);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "invalid_code" });
  });

  it("answers 401 to a code 10 minutes old", async () => {
    const { codeFor, signIn, advance } = setup();
    const code = await codeFor("ana@example.com");

    advance(10 * minute);

    expect((await signIn("ana@example.com", code)).statusCode).toBe(401);
  });

  it("answers 401 to a code that was already used", async () => {
    const { codeFor, signIn } = setup();
    const code = await codeFor("ana@example.com");
    expect((await signIn("ana@example.com", code)).statusCode).toBe(200);

    expect((await signIn("ana@example.com", code)).statusCode).toBe(401);
  });

  it("answers 401 to a code that a newer one replaced", async () => {
    const { codeFor, signIn, advance } = setup();
    const first = await codeFor("ana@example.com");
    advance(minute);
    const second = await codeFor("ana@example.com");

    expect((await signIn("ana@example.com", first)).statusCode).toBe(first === second ? 200 : 401);
    expect((await signIn("ana@example.com", second)).statusCode).toBe(first === second ? 401 : 200);
  });

  it("answers 401 to the right code after 5 wrong attempts", async () => {
    const { codeFor, signIn } = setup();
    const code = await codeFor("ana@example.com");
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await signIn("ana@example.com", otherThan(code))).statusCode).toBe(401);
    }

    expect((await signIn("ana@example.com", code)).statusCode).toBe(401);
  });

  it("gives the same 401 body for wrong, expired, reused and never-requested codes", async () => {
    const { codeFor, signIn, advance } = setup();
    const wrong = await signIn("ana@example.com", otherThan(await codeFor("ana@example.com")));
    const usedCode = await codeFor("ben@example.com");
    await signIn("ben@example.com", usedCode);
    const reused = await signIn("ben@example.com", usedCode);
    const neverRequested = await signIn("cam@example.com", "123456");
    const expiredCode = await codeFor("dan@example.com");
    advance(10 * minute);
    const expired = await signIn("dan@example.com", expiredCode);

    for (const res of [wrong, reused, neverRequested, expired]) {
      expect([res.statusCode, res.body]).toEqual([401, wrong.body]);
    }
  });

  it.each([
    ["a code that is too short", "ana@example.com", "12345"],
    ["a code that is too long", "ana@example.com", "1234567"],
    ["a code with letters", "ana@example.com", "12a456"],
    ["a code sent as a number", "ana@example.com", 123456],
    ["an email over 254 characters", `${"a".repeat(64)}@${"b".repeat(186)}.com`, "123456"],
    ["a missing email", undefined, "123456"],
  ])("answers 400 to %s", async (_case, email, code) => {
    const { signIn } = setup();

    const res = await signIn(email, code);

    expect(res.statusCode).toBe(400);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "invalid_request" });
  });
});

/** Signs in and returns the session and the `Authorization` header for it. */
async function signedIn(harness: ReturnType<typeof setup>, email = "ana@example.com") {
  const res = await harness.signIn(email, await harness.codeFor(email));
  const session = signInResponseSchema.parse(res.json());
  return { ...session, authorization: `Bearer ${session.token}` };
}

describe("GET /me", () => {
  it("returns the signed-in user's id and email", async () => {
    const harness = setup();
    const { user, authorization } = await signedIn(harness);

    const res = await harness.me(authorization);

    expect(res.statusCode).toBe(200);
    expect(meResponseSchema.parse(res.json())).toEqual(user);
  });

  it.each([
    ["no Authorization header", undefined],
    ["an unknown token", "Bearer not-a-real-token"],
    ["an empty bearer token", "Bearer "],
    ["another scheme", "Basic YW5hOnB3"],
  ])("answers 401 with %s", async (_case, authorization) => {
    const harness = setup();
    await signedIn(harness);

    const res = await harness.me(authorization);

    expect(res.statusCode).toBe(401);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "unauthorized" });
  });

  it("answers 401 once the session is 30 days old", async () => {
    const harness = setup();
    const { authorization } = await signedIn(harness);

    harness.advance(30 * 24 * 60 * minute - 1);
    expect((await harness.me(authorization)).statusCode).toBe(200);
    harness.advance(1);
    expect((await harness.me(authorization)).statusCode).toBe(401);
  });
});

describe("POST /auth/sign-out", () => {
  it("ends the session, so its token then gets 401", async () => {
    const harness = setup();
    const { authorization } = await signedIn(harness);

    const res = await harness.signOut(authorization);

    expect([res.statusCode, res.body]).toEqual([204, ""]);
    expect((await harness.me(authorization)).statusCode).toBe(401);
  });

  it("ends only that session", async () => {
    const harness = setup();
    const first = await signedIn(harness);
    const second = await signedIn(harness);

    await harness.signOut(first.authorization);

    expect((await harness.me(second.authorization)).statusCode).toBe(200);
  });

  it.each([
    ["no token", undefined],
    ["an unknown token", "Bearer not-a-real-token"],
  ])("answers 401 with %s", async (_case, authorization) => {
    const harness = setup();

    const res = await harness.signOut(authorization);

    expect(res.statusCode).toBe(401);
    expect(errorResponseSchema.parse(res.json())).toEqual({ error: "unauthorized" });
  });
});

describe("POST /auth/code when the email provider fails", () => {
  const apiKey = "re_test_key_123";
  const providerDetail = "provider-secret-detail";

  /** An app with the real Resend sender on a fake `fetch`, and the log it wrote. */
  function setupWithProvider(fetch: typeof globalThis.fetch) {
    const authStore = createMemoryAuthStore();
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
      authStore,
      groupStore: createMemoryGroupStore(),
      authSecret,
      sendSignInCode: createResendCodeSender({ apiKey, fetch }),
      logger: { level: "trace", stream },
    });
    return { app, authStore, log: () => lines.join("") };
  }

  it.each([
    [
      "answers 500 with a body of its own",
      async () => new Response(JSON.stringify({ message: providerDetail }), { status: 500 }),
    ],
    [
      "rejects the request",
      async () => {
        throw new Error(`${providerDetail} ${apiKey}`);
      },
    ],
  ])("answers a generic 500 when the provider %s", async (_name, fetch) => {
    const { app, authStore, log } = setupWithProvider(fetch);

    const res = await app.inject({
      method: "POST",
      url: "/auth/code",
      payload: { email: "ana@example.com" },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ message: "Could not send the sign-in code" });
    expect(await authStore.countCodesSince("ana@example.com", new Date(0))).toBe(1);
    for (const secret of [providerDetail, apiKey]) {
      expect(res.body).not.toContain(secret);
      expect(log()).not.toContain(secret);
    }
    expect(log()).not.toMatch(/"code":/);
  });
});
