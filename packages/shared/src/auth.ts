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

/** Body of every 4xx response from the auth routes. */
export const errorResponseSchema = z.object({
  error: z.enum(["invalid_request", "invalid_code", "too_many_requests", "unauthorized"]),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Response of `GET /dev/sign-in-code`, which exists only for automated UI tests. */
export const devSignInCodeResponseSchema = z.object({
  code: z.string(),
});

export type DevSignInCodeResponse = z.infer<typeof devSignInCodeResponseSchema>;
