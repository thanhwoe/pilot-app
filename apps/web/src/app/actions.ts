"use server";

import { signOut, submitGroup } from "@gop/shared";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi, groupsApi } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/** Ends the session on the API and clears the cookie, even if the API call fails. */
export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  await signOut(authApi(), cookieStore.get(SESSION_COOKIE)?.value, () => {
    cookieStore.delete(SESSION_COOKIE);
  });
  redirect("/sign-in");
}

export interface CreateGroupState {
  error?: string;
}

/** The create-group form: creates the group as the signed-in member, then refreshes the list. */
export async function createGroupAction(
  _previous: CreateGroupState,
  form: FormData,
): Promise<CreateGroupState> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    redirect("/sign-in");
  }
  const name = form.get("name");
  const outcome = await submitGroup(groupsApi(), token, {
    name: typeof name === "string" ? name : "",
  });
  if (!outcome.created) {
    return { error: outcome.error };
  }
  refresh();
  return {};
}
