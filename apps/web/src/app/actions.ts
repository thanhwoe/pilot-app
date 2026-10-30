"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { signOut } from "@/lib/sign-in-flow";

/** Ends the session on the API and clears the cookie, even if the API call fails. */
export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  await signOut(authApi(), cookieStore.get(SESSION_COOKIE)?.value, () => {
    cookieStore.delete(SESSION_COOKIE);
  });
  redirect("/sign-in");
}
