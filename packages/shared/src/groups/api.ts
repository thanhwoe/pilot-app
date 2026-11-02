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
  type GroupListResponse,
  type GroupResponse,
  groupListResponseSchema,
  groupResponseSchema,
} from "../groups";

/** The #14 group endpoints, as the web server and the mobile app call them. */
export interface GroupsApi {
  listGroups(token: string): Promise<ApiResult<GroupListResponse>>;
  createGroup(token: string, body: CreateGroupBody): Promise<ApiResult<GroupResponse>>;
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
  };
}
