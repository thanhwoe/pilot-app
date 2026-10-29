import type { AuthDeps } from "./routes";

/**
 * Delivers a sign-in code by writing it to the API log. There's no email yet, as the issue asks.
 * Only the code is logged here; session tokens never are.
 */
export const logSignInCode: AuthDeps["sendSignInCode"] = async (email, code, log) => {
  log.info({ email, code }, "Sign-in code");
};
