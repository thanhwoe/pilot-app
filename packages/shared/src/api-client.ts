import { type ErrorResponse, errorResponseSchema } from "./auth";

/** An error body from the API, or `unavailable` when the API can't be reached or answers nonsense. */
export type ApiError = ErrorResponse["error"] | "unavailable";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** The part of a shared Zod schema the client needs. */
interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** How long a call may take before the app shows the connection error instead of waiting. */
export const API_TIMEOUT_MS = 5_000;

/**
 * The one way the shared clients call the API: with a timeout, parsing a success with the shared
 * schema (`null` for an empty body) and an error with `errorResponseSchema`. Anything else,
 * including a network failure, is `unavailable`.
 */
export function createApiCall(baseUrl: string, fetchFn: Fetch, timeoutMs: number) {
  return async function call<T>(
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
  };
}

export const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
