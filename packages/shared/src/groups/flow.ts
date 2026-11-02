import { createGroupBodySchema, type Group } from "../groups";
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
  const result = await api.listGroups(token);
  if (result.ok) {
    return { kind: "loaded", groups: result.data.groups };
  }
  return result.error === "unauthorized" ? { kind: "signed-out" } : { kind: "unavailable" };
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
  const result = await api.createGroup(token, body.data);
  if (!result.ok) {
    if (result.error === "unauthorized") {
      return { created: false, signedOut: true };
    }
    return {
      created: false,
      error: result.error === "invalid_request" ? copy.nameRequired : copy.unavailable,
    };
  }
  return { created: true, group: result.data };
}
