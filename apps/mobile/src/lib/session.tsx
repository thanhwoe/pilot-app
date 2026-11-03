import {
  type AccountState,
  completeSignIn,
  expireSession,
  restoreSession,
  type SignInState,
  signOutSession,
} from "@gop/shared";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { authApi } from "./api";
import { secureSessionStore as store } from "./session-store";

export type SessionState = { kind: "loading" } | AccountState;

interface Session {
  state: SessionState;
  /** Code step: on success the token is stored and the app shows home with the email. */
  signIn(values: { email: string; code: string }): Promise<SignInState | { signedIn: true }>;
  /** Ends the session on the API and deletes the token, even when the API or storage fails. */
  signOut(): Promise<void>;
  /** The API rejected the session during use: deletes the token and shows sign-in. */
  expire(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });

  useEffect(() => {
    restoreSession(authApi, store).then(setState);
  }, []);

  async function signIn(values: { email: string; code: string }) {
    const outcome = await completeSignIn(authApi, store, values);
    if ("signedIn" in outcome) {
      setState({ kind: "signed-in", email: outcome.email });
      return { signedIn: true as const };
    }
    return outcome;
  }

  async function signOut() {
    try {
      await signOutSession(authApi, store);
    } finally {
      setState({ kind: "clear" });
    }
  }

  // Stable, so a screen can list it as an effect dependency without reloading on every render.
  const expire = useCallback(async () => {
    try {
      await expireSession(store);
    } finally {
      setState({ kind: "clear" });
    }
  }, []);

  return <SessionContext value={{ state, signIn, signOut, expire }}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return session;
}
