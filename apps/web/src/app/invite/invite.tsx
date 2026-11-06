import { invitesCopy as copy, groupsCopy, isInviteSignedOut, openInvite } from "@gop/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { groupsApi } from "@/lib/api";
import { redirectRejectedSessionFromComponent } from "@/lib/rejected-session";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { JoinForm } from "./join-form";

/**
 * Server component: what an invite link shows, from the API on every request. A member goes to
 * the groups list. Every link that doesn't work shows the one message, whatever the reason.
 */
export async function Invite({ token }: { token: string }) {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) {
    // The proxy sends visitors without a session to sign-in, with this invite to come back to.
    redirect("/sign-in");
  }
  const state = await openInvite(groupsApi(), session, token);
  if (isInviteSignedOut(state)) {
    redirectRejectedSessionFromComponent();
  }
  if (state.kind === "invite" && state.alreadyMember) {
    redirect("/");
  }

  if (state.kind === "invite") {
    return (
      <section className="invite-page" aria-labelledby="invite-heading">
        <h2 id="invite-heading">{copy.heading(state.groupName)}</h2>
        <JoinForm token={token} />
      </section>
    );
  }
  return state.kind === "bad-link" ? (
    <p>{copy.badLink}</p>
  ) : (
    <p className="form-error">{groupsCopy.unavailable}</p>
  );
}
