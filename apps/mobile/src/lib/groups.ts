import {
  type CreateGroupOutcome,
  type GroupsState,
  groupsCopy,
  loadGroups,
  submitGroup,
} from "@gop/shared";
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
 * My groups, newest first; `signed-out` when the API rejected the session, which the caller must
 * answer by expiring the session; otherwise the connection error.
 */
export async function loadMyGroups(): Promise<GroupsState> {
  const token = await readToken();
  return token ? loadGroups(groupsApi, token) : { kind: "unavailable" };
}

/** Creates a group as the signed-in member. */
export async function createMyGroup(name: string): Promise<CreateGroupOutcome> {
  const token = await readToken();
  if (!token) {
    return { created: false, error: groupsCopy.unavailable };
  }
  return submitGroup(groupsApi, token, { name });
}

/** The list answered that the API rejected the session. */
export function isListSignedOut(state: GroupsState): state is { kind: "signed-out" } {
  return state.kind === "signed-out";
}

/** The create answered that the API rejected the session. */
export function isCreateSignedOut(
  outcome: CreateGroupOutcome,
): outcome is { created: false; signedOut: true } {
  return "signedOut" in outcome;
}
