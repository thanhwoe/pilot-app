import { describe, expect, it } from "vitest";
import { generateSessionToken, generateSignInCode, hashesMatch, hashSecret } from "./secrets";

const secret = "test-secret-that-is-at-least-32-characters";

describe("generateSignInCode", () => {
  it("makes 6-digit codes, some starting with 0", () => {
    const codes = Array.from({ length: 1000 }, generateSignInCode);

    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(codes.some((code) => code.startsWith("0"))).toBe(true);
  });
});

describe("generateSessionToken", () => {
  it("makes long tokens that differ each time", () => {
    const first = generateSessionToken();

    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(generateSessionToken()).not.toBe(first);
  });
});

describe("hashSecret", () => {
  it("does not return the input", () => {
    expect(hashSecret("123456", secret)).not.toContain("123456");
  });

  it("gives the same hash for the same input and secret", () => {
    expect(hashSecret("123456", secret)).toBe(hashSecret("123456", secret));
  });

  it("gives a different hash with a different secret", () => {
    expect(hashSecret("123456", secret)).not.toBe(hashSecret("123456", `${secret}!`));
  });
});

describe("hashesMatch", () => {
  it("compares two hashes", () => {
    expect(hashesMatch(hashSecret("1", secret), hashSecret("1", secret))).toBe(true);
    expect(hashesMatch(hashSecret("1", secret), hashSecret("2", secret))).toBe(false);
  });

  it("does not treat two different non-hex strings as equal", () => {
    expect(hashesMatch("right", "wrong")).toBe(false);
  });
});
