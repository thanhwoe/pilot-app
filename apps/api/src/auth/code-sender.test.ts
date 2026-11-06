import type { FastifyBaseLogger } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { resendEnvSchema, signInCodeSenderFor } from "./code-sender";
import { logSignInCode } from "./log-code-sender";

const log = { info: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;

describe("resendEnvSchema", () => {
  it("has no key when RESEND_API_KEY is unset or empty", () => {
    expect(resendEnvSchema.parse({}).RESEND_API_KEY).toBeUndefined();
    expect(resendEnvSchema.parse({ RESEND_API_KEY: "" }).RESEND_API_KEY).toBeUndefined();
    expect(resendEnvSchema.parse({ RESEND_API_KEY: "  " }).RESEND_API_KEY).toBeUndefined();
  });

  it("keeps the key when it is set", () => {
    expect(resendEnvSchema.parse({ RESEND_API_KEY: "re_x" }).RESEND_API_KEY).toBe("re_x");
  });
});

describe("signInCodeSenderFor", () => {
  it("uses the log sender and never calls fetch without a key", async () => {
    const fetch = vi.fn();
    const sender = signInCodeSenderFor({ RESEND_API_KEY: undefined }, fetch);

    expect(sender).toBe(logSignInCode);
    await sender("ana@example.com", "123456", log);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the email sender with a key", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const sender = signInCodeSenderFor({ RESEND_API_KEY: "re_x" }, fetch);

    expect(sender).not.toBe(logSignInCode);
    await sender("ana@example.com", "123456", log);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
