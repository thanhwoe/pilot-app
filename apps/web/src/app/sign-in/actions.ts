"use server";

import { authApi } from "@/lib/api";
import { type SignInState, submitEmail } from "@/lib/sign-in-flow";

/** The one action behind the sign-in form. The form's `step` field says which step was submitted. */
export async function signInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  return submitEmail(authApi(), form);
}
