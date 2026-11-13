import { inviteTokenSchema } from "@gop/shared";
import { useState } from "react";

/**
 * The token of an invite that a signed-out visitor opened, kept so the app can come back to it
 * after sign-in. In memory only: an app killed in the middle of signing in forgets it, and
 * opening the link again works.
 */
let pending: string | null = null;

/**
 * Keeps the token if it could be an invite's, and says whether it did. The latest link wins: a
 * token of the wrong shape is not kept and clears an earlier one, so after sign-in the app shows
 * the groups list, as the web does.
 */
export function setPendingInvite(token: unknown): boolean {
  const parsed = inviteTokenSchema.safeParse(token);
  pending = parsed.success ? parsed.data : null;
  return parsed.success;
}

/** The pending token, once: it is forgotten as it is taken. */
export function takePendingInvite(): string | null {
  const token = pending;
  pending = null;
  return token;
}

/**
 * Where the home screen sends someone who signed in from an invite link: the invite's path, once,
 * or null. The home screen renders a `Redirect` to it. A `router.replace` made from an effect
 * races the root layout's guard, which resets the stack when the user signs in, and was lost on
 * Android and, from the layout, on iOS (#98); `Redirect` navigates once its screen has focus.
 */
export function usePendingInviteHref(): `/invite/${string}` | null {
  const [href] = useState(() => {
    const token = takePendingInvite();
    return token ? (`/invite/${token}` as const) : null;
  });
  return href;
}
