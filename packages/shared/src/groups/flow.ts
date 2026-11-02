import { createGroupBodySchema, type Group } from "../groups";
import type { GroupsApi } from "./api";
import { groupsCopy as copy } from "./copy";

/** What the groups list shows. */
export type GroupsState = { kind: "loaded"; groups: Group[] } | { kind: "unavailable" };

/**
 * The signed-in member's groups, newest first. Any failure, a 401 included, shows the connection
 * error: the account check on each app already deals with a session the API rejects.
 */
export async function loadGroups(api: GroupsApi, token: string): Promise<GroupsState> {
  const result = await api.listGroups(token);
  return result.ok ? { kind: "loaded", groups: result.data.groups } : { kind: "unavailable" };
}

export type CreateGroupOutcome =
  | { created: true; group: Group }
  | { created: false; error: string };

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
    return {
      created: false,
      error: result.error === "invalid_request" ? copy.nameRequired : copy.unavailable,
    };
  }
  return { created: true, group: result.data };
}
