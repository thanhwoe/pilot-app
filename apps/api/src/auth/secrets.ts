import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** A random 6-digit sign-in code. It may start with 0. */
export function generateSignInCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** A random session token, 256 bits, URL-safe. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** A random group invite token: the same 256 bits, URL-safe, as a session token (#94). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hashes a code or token with HMAC-SHA256 keyed by `AUTH_SECRET`, so a copy of the database
 * alone can't be used to recover a 6-digit code.
 */
export function hashSecret(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Compares two hashes from `hashSecret` in constant time. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
