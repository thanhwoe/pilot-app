import { describe, expect, it } from "vitest";
import {
  canRequestCode,
  codeExpiresAt,
  codeRequestWindowStart,
  emailSchema,
  isCodeUsable,
  isSessionValid,
  requestCodeBodySchema,
  sessionExpiresAt,
  signInBodySchema,
} from "./auth";

const minute = 60_000;
const now = new Date("2026-10-29T10:00:00Z");
const plus = (ms: number) => new Date(now.getTime() + ms);

describe("emailSchema", () => {
  it("trims and lower-cases the email", () => {
    expect(emailSchema.parse("  An@Example.COM ")).toBe("an@example.com");
  });

  it("rejects a value that is not an email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects an email longer than 254 characters", () => {
    const email = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
    expect(email.length).toBe(254);
    expect(emailSchema.safeParse(email).success).toBe(true);
    expect(emailSchema.safeParse(`a${email}`).success).toBe(false);
  });
});

describe("requestCodeBodySchema", () => {
  it("accepts an email and normalizes it", () => {
    expect(requestCodeBodySchema.parse({ email: " A@B.co " })).toEqual({ email: "a@b.co" });
  });

  it("rejects a body without a valid email", () => {
    expect(requestCodeBodySchema.safeParse({}).success).toBe(false);
    expect(requestCodeBodySchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("signInBodySchema", () => {
  it("accepts a 6-digit code, including leading zeros", () => {
    expect(signInBodySchema.parse({ email: "a@b.co", code: "012345" })).toEqual({
      email: "a@b.co",
      code: "012345",
    });
  });

  it.each(["12345", "1234567", "12a456", " 123456", "", 123456])("rejects the code %j", (code) => {
    expect(signInBodySchema.safeParse({ email: "a@b.co", code }).success).toBe(false);
  });
});

describe("isCodeUsable", () => {
  const fresh = { expiresAt: codeExpiresAt(now), usedAt: null, attempts: 0 };

  it("accepts a fresh code", () => {
    expect(isCodeUsable(fresh, now)).toBe(true);
  });

  it("rejects a code 10 minutes after it was created", () => {
    expect(isCodeUsable(fresh, plus(10 * minute - 1))).toBe(true);
    expect(isCodeUsable(fresh, plus(10 * minute))).toBe(false);
  });

  it("rejects a code that was already used", () => {
    expect(isCodeUsable({ ...fresh, usedAt: now }, now)).toBe(false);
  });

  it("rejects a code after 5 wrong attempts", () => {
    expect(isCodeUsable({ ...fresh, attempts: 4 }, now)).toBe(true);
    expect(isCodeUsable({ ...fresh, attempts: 5 }, now)).toBe(false);
  });
});

describe("canRequestCode", () => {
  it("allows up to 5 codes in the window", () => {
    expect(canRequestCode(0)).toBe(true);
    expect(canRequestCode(4)).toBe(true);
    expect(canRequestCode(5)).toBe(false);
  });

  it("counts codes from the last 15 minutes", () => {
    expect(codeRequestWindowStart(now)).toEqual(plus(-15 * minute));
  });
});

describe("isSessionValid", () => {
  it("accepts a session until 30 days after sign-in", () => {
    const session = { expiresAt: sessionExpiresAt(now) };
    expect(isSessionValid(session, plus(30 * 24 * 60 * minute - 1))).toBe(true);
    expect(isSessionValid(session, plus(30 * 24 * 60 * minute))).toBe(false);
  });
});
