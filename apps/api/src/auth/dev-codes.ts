import { type DevSignInCodeResponse, emailSchema } from "@gop/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

/** The env vars that decide whether the dev code endpoint exists. Part of `env.ts`. */
export const devCodesEnvSchema = z.object({
  // Any value, so a platform's own NODE_ENV never stops the API. Only the exact values
  // "development" and "test" turn the dev code endpoint on; unset means off.
  NODE_ENV: z.string().optional(),
  // Only the exact strings: z.coerce.boolean would read "false" as true.
  DEV_SIGN_IN_CODES: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type DevCodesEnv = z.infer<typeof devCodesEnvSchema>;

/** The latest code sent to each email, kept in memory so automated UI tests can sign in. */
export interface DevCodes {
  record(email: string, code: string): void;
  latest(email: string): string | undefined;
}

/**
 * Dev codes when `DEV_SIGN_IN_CODES` is on and `NODE_ENV` is explicitly development or test.
 * Fails closed: production, any other value and an unset `NODE_ENV` all mean off.
 */
export function devCodesFor(env: DevCodesEnv): DevCodes | undefined {
  if (!env.DEV_SIGN_IN_CODES || (env.NODE_ENV !== "development" && env.NODE_ENV !== "test")) {
    return undefined;
  }
  const codes = new Map<string, string>();
  return {
    record: (email, code) => {
      codes.set(email, code);
    },
    latest: (email) => codes.get(email),
  };
}

export function registerDevCodeRoute(app: FastifyInstance, devCodes: DevCodes) {
  app.get("/dev/sign-in-code", async (request, reply) => {
    const email = emailSchema.safeParse((request.query as { email?: unknown }).email);
    const code = email.success ? devCodes.latest(email.data) : undefined;
    if (!code) {
      return reply.code(404).send();
    }
    const response: DevSignInCodeResponse = { code };
    return response;
  });
}
