import { acceptInvite, type InviteState, type JoinOutcome, openInvite } from "@gop/shared";
import { groupsApi } from "./api";
import { secureSessionStore } from "./session-store";

/** The stored token, read for each call so it never enters screen state; null if it can't be read. */
async function readToken(): Promise<string | null> {
  try {
    return await secureSessionStore.get();
  } catch {
    return null;
  }
}

/**
 * What an invite link leads to; `signed-out` when the API rejected the session, which the caller
 * must answer by expiring the session; otherwise the connection error.
 */
export async function openMyInvite(inviteToken: string): Promise<InviteState> {
  const token = await readToken();
  return token ? openInvite(groupsApi, token, inviteToken) : { kind: "unavailable" };
}

/** Joins the group an invite leads to as the signed-in member. */
export async function joinMyInvite(inviteToken: string): Promise<JoinOutcome> {
  const token = await readToken();
  return token ? acceptInvite(groupsApi, token, inviteToken) : { kind: "unavailable" };
}
