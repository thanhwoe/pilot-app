import { devSignInCodeResponseSchema } from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryExpenseStore } from "../expenses/memory-store";
import { createMemoryGroupStore } from "../groups/memory-store";
import { type DevCodes, devCodesEnvSchema, devCodesFor } from "./dev-codes";
import { createMemoryAuthStore } from "./memory-store";

function setup(devCodes: DevCodes | undefined) {
  const sent: string[] = [];
  let now = new Date("2026-10-29T10:00:00Z");
  const app = buildApp({
    pingDb: async () => true,
    corsOrigins: [],
    version: "1.2.3",
    authStore: createMemoryAuthStore(),
    groupStore: createMemoryGroupStore(),
    expenseStore: createMemoryExpenseStore(),
    authSecret: "test-secret-that-is-at-least-32-characters",
    sendSignInCode: async (_email, code) => {
      sent.push(code);
    },
    now: () => now,
    devCodes,
  });

  return {
    sent,
    async requestCode(email: string) {
      now = new Date(now.getTime() + 1000);
      await app.inject({ method: "POST", url: "/auth/code", payload: { email } });
    },
    devCode(email: string) {
      return app.inject({ method: "GET", url: "/dev/sign-in-code", query: { email } });
    },
  };
}

describe("devCodesEnvSchema", () => {
  it("is off by default, with NODE_ENV unset", () => {
    expect(devCodesEnvSchema.parse({})).toEqual({ DEV_SIGN_IN_CODES: false });
  });

  it("accepts any NODE_ENV, so other platforms' values don't stop the API", () => {
    expect(devCodesEnvSchema.parse({ NODE_ENV: "staging" }).NODE_ENV).toBe("staging");
  });

  it.each([
    ["true", true],
    ["false", false],
  ])("reads DEV_SIGN_IN_CODES=%s as %s", (value, expected) => {
    expect(devCodesEnvSchema.parse({ DEV_SIGN_IN_CODES: value }).DEV_SIGN_IN_CODES).toBe(expected);
  });

  it("rejects any other flag value", () => {
    expect(devCodesEnvSchema.safeParse({ DEV_SIGN_IN_CODES: "yes" }).success).toBe(false);
  });
});

describe("devCodesFor", () => {
  it("is off when the flag is off", () => {
    expect(devCodesFor({ NODE_ENV: "development", DEV_SIGN_IN_CODES: false })).toBeUndefined();
  });

  it.each(["development", "test"] as const)("is on with the flag in %s", (NODE_ENV) => {
    expect(devCodesFor({ NODE_ENV, DEV_SIGN_IN_CODES: true })).toBeDefined();
  });

  it("is off in production even with the flag", () => {
    expect(devCodesFor({ NODE_ENV: "production", DEV_SIGN_IN_CODES: true })).toBeUndefined();
  });

  it.each([undefined, "", "staging", "Development"])(
    "is off with the flag when NODE_ENV is %j",
    (NODE_ENV) => {
      expect(devCodesFor({ NODE_ENV, DEV_SIGN_IN_CODES: true })).toBeUndefined();
    },
  );
});

describe("GET /dev/sign-in-code", () => {
  it("answers 404 when the flag is off", async () => {
    const harness = setup(devCodesFor({ NODE_ENV: "development", DEV_SIGN_IN_CODES: false }));
    await harness.requestCode("ana@example.com");

    expect((await harness.devCode("ana@example.com")).statusCode).toBe(404);
  });

  it("answers 404 in production even with the flag on", async () => {
    const harness = setup(devCodesFor({ NODE_ENV: "production", DEV_SIGN_IN_CODES: true }));
    await harness.requestCode("ana@example.com");

    expect((await harness.devCode("ana@example.com")).statusCode).toBe(404);
  });

  it("returns the latest code sent to the email when on", async () => {
    const harness = setup(devCodesFor({ NODE_ENV: "development", DEV_SIGN_IN_CODES: true }));
    await harness.requestCode("ana@example.com");
    await harness.requestCode("ana@example.com");

    const res = await harness.devCode("  ANA@example.com");

    expect(res.statusCode).toBe(200);
    expect(devSignInCodeResponseSchema.parse(res.json())).toEqual({ code: harness.sent.at(-1) });
  });

  it("answers 404 for an email that was sent no code", async () => {
    const harness = setup(devCodesFor({ NODE_ENV: "development", DEV_SIGN_IN_CODES: true }));

    expect((await harness.devCode("nobody@example.com")).statusCode).toBe(404);
    expect((await harness.devCode("not-an-email")).statusCode).toBe(404);
  });
});
