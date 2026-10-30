import { SESSION_TTL_MS } from "@gop/shared";

/** Holds the API's bearer token. Only server code reads or writes it. */
export const SESSION_COOKIE = "gop_session";

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/** `Secure` only in production, so sign-in still works over plain HTTP in development. */
export function sessionCookieOptions(nodeEnv: string | undefined): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: nodeEnv === "production",
    path: "/",
    // The API session lasts 30 days with no renewal; the cookie must not outlive it.
    maxAge: SESSION_TTL_MS / 1000,
  };
}
