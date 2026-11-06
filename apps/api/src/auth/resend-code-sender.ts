import { SIGN_IN_CODE_TTL_MS } from "@gop/shared";
import type { AuthDeps } from "./routes";

const RESEND_URL = "https://api.resend.com/emails";
// No domain yet: Resend delivers from this address only to the key owner's own address.
const FROM = "Góp <onboarding@resend.dev>";
const SUBJECT = "Mã đăng nhập Góp của bạn";
// Under the shared client's 5 s, so the member sees the failure and not a client timeout.
const DEFAULT_TIMEOUT_MS = 4000;
const FAILURE_MESSAGE = "Could not send the sign-in code";

function emailText(code: string) {
  const minutes = SIGN_IN_CODE_TTL_MS / 60_000;
  return [
    "Mã đăng nhập Góp của bạn là:",
    "Your Góp sign-in code is:",
    "",
    code,
    "",
    `Mã có hiệu lực trong ${minutes} phút. Nếu bạn không yêu cầu mã này, hãy bỏ qua email này.`,
  ].join("\n");
}

/**
 * Delivers a sign-in code by email through Resend. Any failure throws one fixed message with no
 * cause: Fastify puts a thrown message in the 500 body, and provider text, the key or the code
 * must reach neither the response nor the log. A failed answer logs its status number only.
 */
export function createResendCodeSender({
  apiKey,
  fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  apiKey: string;
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
}): AuthDeps["sendSignInCode"] {
  return async (email, code, log) => {
    let status: number;
    try {
      const response = await fetch(RESEND_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [email], subject: SUBJECT, text: emailText(code) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
    } catch {
      log.error("Sign-in email could not be sent: no answer from the provider");
      throw new Error(FAILURE_MESSAGE);
    }
    if (status < 200 || status >= 300) {
      log.error(`Sign-in email could not be sent: the provider answered ${status}`);
      throw new Error(FAILURE_MESSAGE);
    }
  };
}
