import {
  createGroupBodySchema,
  type Group,
  type GroupListItem,
  inviteTokenSchema,
} from "../groups";
import { guardSession } from "../session-guard";
import type { GroupsApi } from "./api";
import { groupsCopy as copy } from "./copy";

/** What the groups list shows. `signed-out`: the API rejected the session, so the app shows sign-in. */
export type GroupsState =
  | { kind: "loaded"; groups: GroupListItem[] }
  | { kind: "unavailable" }
  | { kind: "signed-out" };

/** The list answered that the API rejected the session. */
export function isListSignedOut(state: GroupsState): state is { kind: "signed-out" } {
  return state.kind === "signed-out";
}

/**
 * The signed-in member's groups, newest first. A session the API rejects means signed out; any
 * other failure shows the connection error.
 */
export async function loadGroups(api: GroupsApi, token: string): Promise<GroupsState> {
  const result = guardSession(await api.listGroups(token));
  if (result.kind === "ok") {
    return { kind: "loaded", groups: result.data.groups };
  }
  return result.kind === "signed-out" ? { kind: "signed-out" } : { kind: "unavailable" };
}

/** `signedOut`: the API rejected the session, so the app shows sign-in instead of an error. */
export type CreateGroupOutcome =
  | { created: true; group: Group }
  | { created: false; error: string }
  | { created: false; signedOut: true };

/** The create answered that the API rejected the session. */
export function isCreateSignedOut(
  outcome: CreateGroupOutcome,
): outcome is { created: false; signedOut: true } {
  return "signedOut" in outcome;
}

/**
 * The create form: checks the name with the shared schema, then creates the group. The name
 * field accepts at most 100 characters, so an empty name is the only way the check fails.
 */
export async function submitGroup(
  api: GroupsApi,
  token: string,
  values: { name: string },
): Promise<CreateGroupOutcome> {
  const body = createGroupBodySchema.safeParse(values);
  if (!body.success) {
    return { created: false, error: copy.nameRequired };
  }
  const result = guardSession(await api.createGroup(token, body.data));
  if (result.kind === "signed-out") {
    return { created: false, signedOut: true };
  }
  if (result.kind === "failed") {
    return {
      created: false,
      error: result.error === "invalid_request" ? copy.nameRequired : copy.unavailable,
    };
  }
  return { created: true, group: result.data };
}

/** `signedOut`: the API rejected the session, so the app shows sign-in instead of an error. */
export type InviteLinkOutcome =
  | { made: true; token: string }
  | { made: false; error: string }
  | { made: false; signedOut: true };

/** Making the link answered that the API rejected the session. */
export function isInviteLinkSignedOut(
  outcome: InviteLinkOutcome,
): outcome is { made: false; signedOut: true } {
  return "signedOut" in outcome;
}

/**
 * Makes the group's invite link, or replaces it so the old one stops working. The token comes
 * back this once. A session the API rejects means signed out; any other failure shows the
 * connection error and keeps the session.
 */
export async function makeInviteLink(
  api: GroupsApi,
  token: string,
  groupId: string,
): Promise<InviteLinkOutcome> {
  const result = guardSession(await api.createInvite(token, groupId));
  if (result.kind === "ok") {
    return { made: true, token: result.data.token };
  }
  return result.kind === "signed-out"
    ? { made: false, signedOut: true }
    : { made: false, error: copy.unavailable };
}

/**
 * What an invite link shows. `bad-link` is every link that does not work (wrong, malformed,
 * unknown or replaced), with no word of why. `signed-out`: the API rejected the session.
 */
export type InviteState =
  | { kind: "invite"; groupName: string; alreadyMember: boolean }
  | { kind: "bad-link" }
  | { kind: "unavailable" }
  | { kind: "signed-out" };

/** The link answered that the API rejected the session. */
export function isInviteSignedOut(state: { kind: string }): state is { kind: "signed-out" } {
  return state.kind === "signed-out";
}

/** Opens an invite: the group's name, and whether I am already a member. */
export async function openInvite(
  api: GroupsApi,
  token: string,
  inviteToken: string,
): Promise<InviteState> {
  // A token of the wrong shape can't be anyone's link: the same answer, without a request.
  if (!inviteTokenSchema.safeParse(inviteToken).success) {
    return { kind: "bad-link" };
  }
  const result = guardSession(await api.previewInvite(token, inviteToken));
  if (result.kind === "ok") {
    return { kind: "invite", ...result.data };
  }
  if (result.kind === "signed-out") {
    return { kind: "signed-out" };
  }
  return result.error === "not_found" ? { kind: "bad-link" } : { kind: "unavailable" };
}

/** What joining through an invite did. The states are those of `InviteState`. */
export type JoinOutcome =
  | { kind: "joined"; group: Group }
  | { kind: "bad-link" }
  | { kind: "unavailable" }
  | { kind: "signed-out" };

/** Joins the group an invite leads to; joining as a member changes nothing. */
export async function acceptInvite(
  api: GroupsApi,
  token: string,
  inviteToken: string,
): Promise<JoinOutcome> {
  if (!inviteTokenSchema.safeParse(inviteToken).success) {
    return { kind: "bad-link" };
  }
  const result = guardSession(await api.joinWithInvite(token, inviteToken));
  if (result.kind === "ok") {
    return { kind: "joined", group: result.data };
  }
  if (result.kind === "signed-out") {
    return { kind: "signed-out" };
  }
  return result.error === "not_found" ? { kind: "bad-link" } : { kind: "unavailable" };
}
