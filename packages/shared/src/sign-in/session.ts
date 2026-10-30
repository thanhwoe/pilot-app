import type { AuthApi } from "./api";
import { type AccountState, accountState, type SignInState, submitCode } from "./flow";

/** Where an app keeps the session token: `expo-secure-store` on mobile. */
export interface SessionStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  delete(): Promise<void>;
}

/**
 * Code step for an app that keeps its own token: signs in, then saves the token in the store.
 * The result never holds the token, so it can't end up in screen state or on screen.
 */
export async function completeSignIn(
  api: AuthApi,
  store: SessionStore,
  values: { email: string; code: string },
): Promise<SignInState | { signedIn: true }> {
  const outcome = await submitCode(api, values);
  if (!("signedIn" in outcome)) {
    return outcome;
  }
  await store.set(outcome.token);
  return { signedIn: true };
}

/**
 * App start: asks `GET /me` about the stored token. A token the API rejects is deleted; when the
 * API can't be reached the token is kept, so the user stays signed in and can still sign out.
 */
export async function restoreSession(api: AuthApi, store: SessionStore): Promise<AccountState> {
  const token = await store.get();
  const state = accountState(token ? await api.me(token) : null);
  if (state.kind === "clear" && token) {
    await store.delete();
  }
  return state;
}
