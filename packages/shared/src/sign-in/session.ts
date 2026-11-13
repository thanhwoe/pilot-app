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
 * The result never holds the token, so it can't end up in screen state or on screen; the email
 * comes from the sign-in response, so no second call is needed.
 */
export async function completeSignIn(
  api: AuthApi,
  store: SessionStore,
  values: { email: string; code: string },
): Promise<SignInState | { signedIn: true; email: string; userId: string }> {
  const outcome = await submitCode(api, values);
  if (!("signedIn" in outcome)) {
    return outcome;
  }
  await store.set(outcome.token);
  return { signedIn: true, email: outcome.email, userId: outcome.userId };
}

/**
 * App start: asks `GET /me` about the stored token. A token the API rejects is deleted; when the
 * API can't be reached the token is kept, so the user stays signed in and can still sign out.
 * A store that can't be read (say, a keystore key lost after a restore) means signed out.
 */
export async function restoreSession(api: AuthApi, store: SessionStore): Promise<AccountState> {
  let token: string | null;
  try {
    token = await store.get();
  } catch {
    await deleteQuietly(store);
    return { kind: "clear" };
  }

  const state = accountState(token ? await api.me(token) : null);
  if (state.kind === "clear" && token) {
    await deleteQuietly(store);
  }
  return state;
}

/**
 * Ends the session on the API, then deletes the stored token whatever the API or the store did:
 * someone who asks to sign out must end up signed out on this device.
 */
export async function signOutSession(api: AuthApi, store: SessionStore): Promise<void> {
  try {
    const token = await store.get();
    if (token) {
      await api.signOut(token);
    }
  } catch {
    // The API session then lasts until it expires; the token is deleted below either way.
  } finally {
    await deleteQuietly(store);
  }
}

/**
 * A session the API rejected during use (a 401 from another call): deletes the stored token and
 * never throws. No API call: the API has already rejected that token.
 */
export async function expireSession(store: SessionStore): Promise<void> {
  await deleteQuietly(store);
}

async function deleteQuietly(store: SessionStore): Promise<void> {
  try {
    await store.delete();
  } catch {
    // Nothing more can be done on this device; the app still shows sign-in.
  }
}
