"use server";

import { changeEmail, type SignInState, submitCode, submitEmail } from "@gop/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api";
import { safeReturnPath } from "@/lib/return-path";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

/** A form field as a string; a missing or file field reads as empty, which the schemas reject. */
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** The one action behind the sign-in form. The form's `step` field says which step was submitted. */
export async function signInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = field(form, "email");
  if (form.get("intent") === "change-email") {
    return changeEmail(email);
  }
  if (form.get("step") !== "code") {
    return submitEmail(authApi(), { email });
  }

  const outcome = await submitCode(authApi(), { email, code: field(form, "code") });
  if (!("signedIn" in outcome)) {
    return outcome;
  }
  (await cookies()).set(SESSION_COOKIE, outcome.token, sessionCookieOptions(process.env.NODE_ENV));
  // Back to the invite the visitor came from; anything else in `next` is ignored (#94).
  redirect(safeReturnPath(form.get("next")));
}
