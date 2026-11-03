import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./session-cookie";

/**
 * The API rejected the session (401 `unauthorized`) during a Server Action: removes the cookie
 * and shows sign-in, not a retry message. Call it outside any `try`, because `redirect` throws.
 */
export async function endRejectedSessionInAction(): Promise<never> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/sign-in");
}

/**
 * The same, in a Server Component, which can't change cookies: the fixed `/session/clear` route
 * removes the cookie and goes to sign-in. Call it outside any `try`, because `redirect` throws.
 */
export function redirectRejectedSessionFromComponent(): never {
  redirect("/session/clear");
}
