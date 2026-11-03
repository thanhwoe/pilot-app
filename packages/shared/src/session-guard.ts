import type { ApiError, ApiResult } from "./api-client";

/**
 * What a screen does with the result of a call that sends the session token: use the data, show
 * sign-in because the API rejected the session, or handle the failure and keep the session.
 */
export type Guarded<T> =
  | { kind: "ok"; data: T }
  | { kind: "signed-out" }
  | { kind: "failed"; error: ApiError };

/**
 * The one place that reads a 401 `unauthorized` as "the session has ended". Every other answer,
 * including a 401 with another error code, a timeout or a server error, keeps the session.
 */
export function guardSession<T>(result: ApiResult<T>): Guarded<T> {
  if (result.ok) {
    return { kind: "ok", data: result.data };
  }
  return result.error === "unauthorized"
    ? { kind: "signed-out" }
    : { kind: "failed", error: result.error };
}
