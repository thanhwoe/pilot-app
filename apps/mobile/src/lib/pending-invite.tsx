import { inviteTokenSchema } from "@gop/shared";
import { router } from "expo-router";
import { useEffect } from "react";
import { useSession } from "./session";

/**
 * The token of an invite that a signed-out visitor opened, kept so the app can come back to it
 * after sign-in. In memory only: an app killed in the middle of signing in forgets it, and
 * opening the link again works.
 */
let pending: string | null = null;

/**
 * Keeps the token if it could be an invite's, and says whether it did. A token of the wrong shape
 * is not kept, so after sign-in the app shows the groups list, as the web does.
 */
export function setPendingInvite(token: unknown): boolean {
  const parsed = inviteTokenSchema.safeParse(token);
  if (parsed.success) {
    pending = parsed.data;
  }
  return parsed.success;
}

/** The pending token, once: it is forgotten as it is taken. */
export function takePendingInvite(): string | null {
  const token = pending;
  pending = null;
  return token;
}

/**
 * Goes to the pending invite when the session turns signed in. It belongs in the root layout,
 * where the guard flips: the sign-in screen is gone by then.
 */
export function useReturnToPendingInvite() {
  const { state } = useSession();
  const signedIn = state.kind !== "loading" && state.kind !== "clear";

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    const token = takePendingInvite();
    if (token) {
      router.replace(`/invite/${token}`);
    }
  }, [signedIn]);
}
