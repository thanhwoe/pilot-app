import { z } from "zod";

/** An email as the API stores it: trimmed and lower-cased, at most 254 characters. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Body of `POST /auth/code`. */
export const requestCodeBodySchema = z.object({
  email: emailSchema,
});

export type RequestCodeBody = z.infer<typeof requestCodeBodySchema>;

/** Body of `POST /auth/sign-in`. */
export const signInBodySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
});

export type SignInBody = z.infer<typeof signInBodySchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
});

export type User = z.infer<typeof userSchema>;

/** Response of `POST /auth/sign-in`. Clients send `token` as `Authorization: Bearer <token>`. */
export const signInResponseSchema = z.object({
  token: z.string().min(1),
  user: userSchema,
});

export type SignInResponse = z.infer<typeof signInResponseSchema>;

/** Response of `GET /me`. */
export const meResponseSchema = userSchema;

export type MeResponse = z.infer<typeof meResponseSchema>;

/** Body of every 4xx response from the API. */
export const errorResponseSchema = z.object({
  error: z.enum([
    "invalid_request",
    "invalid_code",
    "too_many_requests",
    "unauthorized",
    "not_found",
  ]),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Response of `GET /dev/sign-in-code`, which exists only for automated UI tests. */
export const devSignInCodeResponseSchema = z.object({
  code: z.string(),
});

export type DevSignInCodeResponse = z.infer<typeof devSignInCodeResponseSchema>;

const minute = 60_000;

/** A sign-in code works for 10 minutes. */
export const SIGN_IN_CODE_TTL_MS = 10 * minute;
/** After this many wrong attempts the code stops working, even with the right digits. */
export const MAX_CODE_ATTEMPTS = 5;
/** At most this many codes per email in `CODE_REQUEST_WINDOW_MS`. */
export const MAX_CODE_REQUESTS = 5;
export const CODE_REQUEST_WINDOW_MS = 15 * minute;
/** A session lasts 30 days from sign-in, with no renewal. */
export const SESSION_TTL_MS = 30 * 24 * 60 * minute;

export interface SignInCodeState {
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
}

export function codeExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SIGN_IN_CODE_TTL_MS);
}

/** Whether a code may still be checked. Only the newest code for an email is ever checked. */
export function isCodeUsable(code: SignInCodeState, now: Date): boolean {
  return code.usedAt === null && code.attempts < MAX_CODE_ATTEMPTS && now < code.expiresAt;
}

/** Start of the window in which earlier code requests count against the limit. */
export function codeRequestWindowStart(now: Date): Date {
  return new Date(now.getTime() - CODE_REQUEST_WINDOW_MS);
}

/** Whether another code may be sent, given how many were sent since `codeRequestWindowStart`. */
export function canRequestCode(recentRequests: number): boolean {
  return recentRequests < MAX_CODE_REQUESTS;
}

export function sessionExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_TTL_MS);
}

export function isSessionValid(session: { expiresAt: Date }, now: Date): boolean {
  return now < session.expiresAt;
}
