import { z } from "zod";
import { logSignInCode } from "./log-code-sender";
import { createResendCodeSender } from "./resend-code-sender";
import type { AuthDeps } from "./routes";

/** The env var that decides how sign-in codes are delivered. Part of `env.ts`. */
export const resendEnvSchema = z.object({
  // Empty counts as unset, so `cp .env.example .env` keeps the log sender.
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ResendEnv = z.infer<typeof resendEnvSchema>;

/** Email through Resend when `RESEND_API_KEY` is set; otherwise the code goes to the API log. */
export function signInCodeSenderFor(
  env: ResendEnv,
  fetch: typeof globalThis.fetch,
): AuthDeps["sendSignInCode"] {
  return env.RESEND_API_KEY
    ? createResendCodeSender({ apiKey: env.RESEND_API_KEY, fetch })
    : logSignInCode;
}
