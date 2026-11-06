import type { AuthDeps } from "./routes";

/**
 * Delivers a sign-in code by writing it to the API log. Used when `RESEND_API_KEY` is not set;
 * with it, `resend-code-sender.ts` emails the code and nothing logs it.
 * Only the code is logged here; session tokens never are.
 */
export const logSignInCode: AuthDeps["sendSignInCode"] = async (email, code, log) => {
  log.info({ email, code }, "Sign-in code");
};
