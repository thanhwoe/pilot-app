import {
  API_TIMEOUT_MS,
  type ApiResult,
  bearer,
  createApiCall,
  type Fetch,
  postJson,
} from "../api-client";
import {
  type MeResponse,
  meResponseSchema,
  type RequestCodeBody,
  type SignInBody,
  type SignInResponse,
  signInResponseSchema,
} from "../auth";

export type { ApiError, ApiResult } from "../api-client";

/** The #5 auth endpoints, as the web server and the mobile app call them. */
export interface AuthApi {
  requestCode(body: RequestCodeBody): Promise<ApiResult<null>>;
  signIn(body: SignInBody): Promise<ApiResult<SignInResponse>>;
  me(token: string): Promise<ApiResult<MeResponse>>;
  signOut(token: string): Promise<ApiResult<null>>;
}

/** `baseUrl` comes from each app: `API_URL` on the web, `EXPO_PUBLIC_API_URL` on mobile. */
export function createAuthApi(
  baseUrl: string,
  fetchFn: Fetch = fetch,
  timeoutMs = API_TIMEOUT_MS,
): AuthApi {
  const call = createApiCall(baseUrl, fetchFn, timeoutMs);

  return {
    requestCode: (body) => call("/auth/code", postJson(body), null),
    signIn: (body) => call("/auth/sign-in", postJson(body), signInResponseSchema),
    me: (token) => call("/me", { headers: bearer(token) }, meResponseSchema),
    signOut: (token) => call("/auth/sign-out", { method: "POST", headers: bearer(token) }, null),
  };
}
