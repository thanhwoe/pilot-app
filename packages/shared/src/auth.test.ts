import { describe, expect, it } from "vitest";
import { emailSchema, requestCodeBodySchema, signInBodySchema } from "./auth";

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
