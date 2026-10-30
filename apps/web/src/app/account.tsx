import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api";
import { copy } from "@/lib/copy";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { signOutAction } from "./actions";

/** Server component: who is signed in, from `GET /me` on every request. */
export async function Account() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const me = token ? await authApi().me(token) : null;

  if (me && !me.ok && me.error === "unauthorized") {
    // Expired, signed out elsewhere or made up: the route handler removes the cookie.
    redirect("/session/clear");
  }
  if (!me?.ok) {
    // The API is down: keep the session, and the API status line below says what's wrong.
    return <p className="form-error">{copy.unavailable}</p>;
  }
  return (
    <div className="account">
      <p>{copy.signedInAs(me.data.email)}</p>
      <form action={signOutAction}>
        <button type="submit">{copy.signOut}</button>
      </form>
    </div>
  );
}
