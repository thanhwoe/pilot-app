import { inviteTokenSchema } from "@gop/shared";

const INVITE_PATH = /^\/invite\/([A-Za-z0-9_-]+)$/;

/** The address of an invite page. */
export function invitePath(token: string): string {
  return `/invite/${token}`;
}

/**
 * Where sign-in may send someone afterwards: exactly the invite page of a token with the right
 * shape, and nothing else. The address comes from the query string or a form field, so anything
 * else (another site, another page, extra path, a query) becomes the groups list. This is what
 * keeps `?next=` from being an open redirect.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") {
    return "/";
  }
  const token = INVITE_PATH.exec(value)?.[1];
  return token && inviteTokenSchema.safeParse(token).success ? value : "/";
}
