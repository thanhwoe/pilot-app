import { cookies } from "next/headers";
import { authApi } from "@/lib/api";
import { copy } from "@/lib/copy";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/** Server component: who is signed in, from `GET /me` on every request. */
export async function Account() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const me = token ? await authApi().me(token) : null;

  if (!me?.ok) {
    return <p className="form-error">{copy.unavailable}</p>;
  }
  return <p className="account">{copy.signedInAs(me.data.email)}</p>;
}
