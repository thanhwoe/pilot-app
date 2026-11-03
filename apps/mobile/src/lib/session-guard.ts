import { useCallback, useEffect, useRef } from "react";
import { useSession } from "./session";

/**
 * Runs a call that sends the session token. When it answers that the API rejected the session
 * (`isSignedOut`), this expires the session: the stored token goes and sign-in shows. A screen
 * never handles a 401 itself.
 *
 * It returns `null` when there is nothing left for the screen to show: the session was just
 * expired, or the screen is gone. A call still pending when the user signs out can answer 401
 * after the next sign-in, when the stored token is a new one, so it must expire nothing.
 */
export function useSessionGuard() {
  const { expire } = useSession();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Stable, so a screen can list it as an effect dependency without reloading on every render.
  return useCallback(
    async <T, S extends T>(
      call: () => Promise<T>,
      isSignedOut: (result: T) => result is S,
    ): Promise<Exclude<T, S> | null> => {
      const result = await call();
      if (!mounted.current) {
        return null;
      }
      if (isSignedOut(result)) {
        await expire();
        return null;
      }
      return result as Exclude<T, S>;
    },
    [expire],
  );
}
