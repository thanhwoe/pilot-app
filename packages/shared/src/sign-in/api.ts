import {
  type ErrorResponse,
  errorResponseSchema,
  type MeResponse,
  meResponseSchema,
  type RequestCodeBody,
  type SignInBody,
  type SignInResponse,
  signInResponseSchema,
} from "../auth";

/** An error body from the API, or `unavailable` when the API can't be reached or answers nonsense. */
export type ApiError = ErrorResponse["error"] | "unavailable";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** The #5 auth endpoints, as the web server and the mobile app call them. */
export interface AuthApi {
  requestCode(body: RequestCodeBody): Promise<ApiResult<null>>;
  signIn(body: SignInBody): Promise<ApiResult<SignInResponse>>;
  me(token: string): Promise<ApiResult<MeResponse>>;
  signOut(token: string): Promise<ApiResult<null>>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** The part of a shared Zod schema this client needs. */
interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** How long a call may take before the app shows the connection error instead of waiting. */
const API_TIMEOUT_MS = 5_000;

/** `baseUrl` comes from each app: `API_URL` on the web, `EXPO_PUBLIC_API_URL` on mobile. */
export function createAuthApi(
  baseUrl: string,
  fetchFn: Fetch = fetch,
  timeoutMs = API_TIMEOUT_MS,
): AuthApi {
  async function call<T>(
    path: string,
    init: RequestInit,
    schema: Schema<T> | null,
  ): Promise<ApiResult<T>> {
    // AbortController and setTimeout rather than AbortSignal.timeout, which React Native may lack.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${baseUrl}${path}`, { ...init, signal: controller.signal });
      if (res.ok) {
        if (schema === null) {
          return { ok: true, data: null as T };
        }
        const data = schema.safeParse(await res.json());
        return data.success ? { ok: true, data: data.data } : { ok: false, error: "unavailable" };
      }
      const body = errorResponseSchema.safeParse(await res.json());
      return { ok: false, error: body.success ? body.data.error : "unavailable" };
    } catch {
      return { ok: false, error: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }

  const postJson = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  return {
    requestCode: (body) => call("/auth/code", postJson(body), null),
    signIn: (body) => call("/auth/sign-in", postJson(body), signInResponseSchema),
    me: (token) => call("/me", { headers: bearer(token) }, meResponseSchema),
    signOut: (token) => call("/auth/sign-out", { method: "POST", headers: bearer(token) }, null),
  };
}
