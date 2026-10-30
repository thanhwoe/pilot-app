"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";
import { type SignInState, submitCode, submitEmail } from "@/lib/sign-in-flow";

/** The one action behind the sign-in form. The form's `step` field says which step was submitted. */
export async function signInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  if (form.get("intent") === "change-email") {
    const email = form.get("email");
    return { step: "email", email: typeof email === "string" ? email : undefined };
  }
  if (form.get("step") !== "code") {
    return submitEmail(authApi(), form);
  }

  const outcome = await submitCode(authApi(), form);
  if (!("signedIn" in outcome)) {
    return outcome;
  }
  (await cookies()).set(SESSION_COOKIE, outcome.token, sessionCookieOptions(process.env.NODE_ENV));
  redirect("/");
}
