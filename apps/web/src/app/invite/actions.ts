"use server";

import {
  acceptInvite,
  groupsCopy,
  invitesCopy,
  isInviteLinkSignedOut,
  makeInviteLink,
} from "@gop/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { groupsApi } from "@/lib/api";
import { endRejectedSessionInAction } from "@/lib/rejected-session";
import { SESSION_COOKIE } from "@/lib/session-cookie";

export interface CreateInviteState {
  /** The new link's token. It is shown only this once: the API keeps just its hash (#94). */
  token?: string;
  error?: string;
}

/** The invite button of one group: makes its link, or replaces it so the old one stops working. */
export async function createInviteAction(
  _previous: CreateInviteState,
  form: FormData,
): Promise<CreateInviteState> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/sign-in");
  }
  const groupId = form.get("groupId");
  const outcome = await makeInviteLink(
    groupsApi(),
    token,
    typeof groupId === "string" ? groupId : "",
  );
  if (!outcome.made) {
    if (isInviteLinkSignedOut(outcome)) {
      return endRejectedSessionInAction();
    }
    return { error: outcome.error };
  }
  return { token: outcome.token };
}

export interface JoinGroupState {
  error?: string;
}

/**
 * The join button on an invite page. A link that doesn't work, for any reason, shows one message
 * and joins no one. Joining as a member changes nothing. On success it goes to the groups list.
 */
export async function joinGroupAction(
  _previous: JoinGroupState,
  form: FormData,
): Promise<JoinGroupState> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) {
    redirect("/sign-in");
  }
  const inviteToken = form.get("token");
  const outcome = await acceptInvite(
    groupsApi(),
    session,
    typeof inviteToken === "string" ? inviteToken : "",
  );
  if (outcome.kind === "signed-out") {
    return endRejectedSessionInAction();
  }
  if (outcome.kind === "bad-link") {
    return { error: invitesCopy.badLink };
  }
  if (outcome.kind === "unavailable") {
    return { error: groupsCopy.unavailable };
  }
  redirect("/");
}
