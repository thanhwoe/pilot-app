import {
  API_TIMEOUT_MS,
  type ApiResult,
  bearer,
  createApiCall,
  type Fetch,
  postJson,
} from "../api-client";
import {
  type CreateGroupBody,
  type CreateInviteResponse,
  createInviteResponseSchema,
  type GroupListResponse,
  type GroupResponse,
  groupListResponseSchema,
  groupResponseSchema,
  type InvitePreviewResponse,
  invitePreviewResponseSchema,
} from "../groups";

/** A JSON POST that also sends the session token. */
function withBearer(init: RequestInit, token: string): RequestInit {
  return { ...init, headers: { ...init.headers, ...bearer(token) } };
}

/** The #14 group endpoints, as the web server and the mobile app call them. */
export interface GroupsApi {
  listGroups(token: string): Promise<ApiResult<GroupListResponse>>;
  createGroup(token: string, body: CreateGroupBody): Promise<ApiResult<GroupResponse>>;
  /** Makes the group's invite link, or replaces it; the old link then joins no one (#94). */
  createInvite(token: string, groupId: string): Promise<ApiResult<CreateInviteResponse>>;
  /** What an invite leads to. `not_found` for any token that does not work, whatever the reason. */
  previewInvite(token: string, inviteToken: string): Promise<ApiResult<InvitePreviewResponse>>;
  /** Joins the group an invite leads to. Joining as a member changes nothing. */
  joinWithInvite(token: string, inviteToken: string): Promise<ApiResult<GroupResponse>>;
}

/** `baseUrl` comes from each app, as for `createAuthApi`. */
export function createGroupsApi(
  baseUrl: string,
  fetchFn: Fetch = fetch,
  timeoutMs = API_TIMEOUT_MS,
): GroupsApi {
  const call = createApiCall(baseUrl, fetchFn, timeoutMs);

  return {
    listGroups: (token) => call("/groups", { headers: bearer(token) }, groupListResponseSchema),
    createGroup: (token, body) => {
      const init = postJson(body);
      return call(
        "/groups",
        { ...init, headers: { ...init.headers, ...bearer(token) } },
        groupResponseSchema,
      );
    },
    createInvite: (token, groupId) =>
      call(
        `/groups/${encodeURIComponent(groupId)}/invite`,
        { method: "POST", headers: bearer(token) },
        createInviteResponseSchema,
      ),
    // The invite token goes in the body, not the URL: the API logs every request URL.
    previewInvite: (token, inviteToken) =>
      call(
        "/invites/preview",
        withBearer(postJson({ token: inviteToken }), token),
        invitePreviewResponseSchema,
      ),
    joinWithInvite: (token, inviteToken) =>
      call(
        "/invites/join",
        withBearer(postJson({ token: inviteToken }), token),
        groupResponseSchema,
      ),
  };
}
