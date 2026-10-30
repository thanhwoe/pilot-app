import { accountState, signInCopy as copy } from "@gop/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { signOutAction } from "./actions";

/** Server component: who is signed in, from `GET /me` on every request. */
export async function Account() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const state = accountState(token ? await authApi().me(token) : null);

  if (state.kind === "clear") {
    // A Server Component can't change cookies; the route handler removes it.
    redirect("/session/clear");
  }
  return (
    <div className="account">
      {state.kind === "signed-in" ? (
        <p>{copy.signedInAs(state.email)}</p>
      ) : (
        // The API is down: keep the session; the API status line below says what's wrong.
        <p className="form-error">{copy.unavailable}</p>
      )}
      <form action={signOutAction}>
        <button type="submit">{copy.signOut}</button>
      </form>
    </div>
  );
}
