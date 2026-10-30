import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, sessionCookieOptions } from "./session-cookie";

const thirtyDaysInSeconds = 30 * 24 * 60 * 60;

describe("sessionCookieOptions", () => {
  it("is httpOnly, SameSite=Lax and Secure in production, for 30 days", () => {
    expect(sessionCookieOptions("production")).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: thirtyDaysInSeconds,
    });
  });

  it.each(["development", "test", undefined])("is not Secure when NODE_ENV is %s", (nodeEnv) => {
    expect(sessionCookieOptions(nodeEnv)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: thirtyDaysInSeconds,
    });
  });
});

describe("SESSION_COOKIE", () => {
  it("is gop_session", () => {
    expect(SESSION_COOKIE).toBe("gop_session");
  });
});
