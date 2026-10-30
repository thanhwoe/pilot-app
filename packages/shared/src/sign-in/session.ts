import type { AuthApi } from "./api";
import { type SignInState, submitCode } from "./flow";

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
