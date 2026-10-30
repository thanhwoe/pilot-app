import {
  type ErrorResponse,
  errorResponseSchema,
  type MeResponse,
  meResponseSchema,
  type RequestCodeBody,
  type SignInBody,
  type SignInResponse,
  signInResponseSchema,
} from "@gop/shared";

/** An error body from the API, or `unavailable` when the API can't be reached or answers nonsense. */
export type ApiError = ErrorResponse["error"] | "unavailable";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** The #5 auth endpoints. Server-only: the session token never reaches the browser. */
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

export function createAuthApi(baseUrl: string, fetchFn: Fetch = fetch): AuthApi {
  async function call<T>(
    path: string,
    init: RequestInit,
    schema: Schema<T> | null,
  ): Promise<ApiResult<T>> {
    try {
      const res = await fetchFn(`${baseUrl}${path}`, init);
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

/** The API the web server talks to. Read at call time, so one build works in every environment. */
export function authApi(): AuthApi {
  return createAuthApi(process.env.API_URL ?? "http://localhost:3001");
}
