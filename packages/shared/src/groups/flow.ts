import { createGroupBodySchema, type Group } from "../groups";
import { guardSession } from "../session-guard";
import type { GroupsApi } from "./api";
import { groupsCopy as copy } from "./copy";

/** What the groups list shows. `signed-out`: the API rejected the session, so the app shows sign-in. */
export type GroupsState =
  | { kind: "loaded"; groups: Group[] }
  | { kind: "unavailable" }
  | { kind: "signed-out" };

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
