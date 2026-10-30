import { emailSchema, type MeResponse, signInBodySchema } from "@gop/shared";
import type { ApiError, ApiResult, AuthApi } from "./api";
import { copy } from "./copy";

/** What the sign-in page shows. `email` is what the user typed, or the normalized email once valid. */
export type SignInState =
  | { step: "email"; email?: string; error?: string }
  | { step: "code"; email: string; error?: string };

export type CodeOutcome = SignInState | { signedIn: true; token: string };

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

const emailStepError: Partial<Record<ApiError, string>> = {
  invalid_request: copy.invalidEmail,
  too_many_requests: copy.tooManyRequests,
};

const codeStepError: Partial<Record<ApiError, string>> = {
  invalid_code: copy.wrongCode,
  invalid_request: copy.codeFormat,
};

/** Email step: checks the email with the shared schema, then asks the API for a code. */
export async function submitEmail(api: AuthApi, form: FormData): Promise<SignInState> {
  const raw = field(form, "email");
  const email = emailSchema.safeParse(raw);
  if (!email.success) {
    return { step: "email", email: raw, error: copy.invalidEmail };
  }

  const result = await api.requestCode({ email: email.data });
  if (!result.ok) {
    return {
      step: "email",
      email: email.data,
      error: emailStepError[result.error] ?? copy.unavailable,
    };
  }
  return { step: "code", email: email.data };
}

/** Code step: checks email and code with the shared schema, then signs in. */
export async function submitCode(api: AuthApi, form: FormData): Promise<CodeOutcome> {
  const rawEmail = field(form, "email");
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) {
    return { step: "email", email: rawEmail, error: copy.invalidEmail };
  }

  const body = signInBodySchema.safeParse({ email: email.data, code: field(form, "code") });
  if (!body.success) {
    return { step: "code", email: email.data, error: copy.codeFormat };
  }

  const result = await api.signIn(body.data);
  if (!result.ok) {
    return {
      step: "code",
      email: email.data,
      error: codeStepError[result.error] ?? copy.unavailable,
    };
  }
  return { signedIn: true, token: result.data.token };
}

/**
 * Ends the session on the API, then clears the cookie whatever the API answered: someone who asks
 * to sign out must end up signed out in this browser, even when the API is down.
 */
export async function signOut(
  api: AuthApi,
  token: string | undefined,
  clearCookie: () => void | Promise<void>,
): Promise<void> {
  try {
    if (token) {
      await api.signOut(token);
    }
  } catch {
    // The session then lasts until it expires on the API; the browser no longer holds its token.
  } finally {
    await clearCookie();
  }
}

/** "Dùng email khác": back to the email step, keeping the email so it can be corrected. */
export function changeEmail(form: FormData): SignInState {
  return { step: "email", email: field(form, "email") };
}

export type AccountState =
  | { kind: "signed-in"; email: string }
  | { kind: "unavailable" }
  | { kind: "clear" };

/**
 * What the home page shows for the session cookie. `me` is the `GET /me` result, or null when the
 * cookie holds no token. A rejected or empty session is cleared; when the API is down the session
 * is kept, and sign-out is still offered because it works without the API.
 */
export function accountState(me: ApiResult<MeResponse> | null): AccountState {
  if (me === null || (!me.ok && me.error === "unauthorized")) {
    return { kind: "clear" };
  }
  return me.ok ? { kind: "signed-in", email: me.data.email } : { kind: "unavailable" };
}
