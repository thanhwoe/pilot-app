import {
  canRequestCode,
  codeExpiresAt,
  codeRequestWindowStart,
  type ErrorResponse,
  requestCodeBodySchema,
  type SignInResponse,
  sessionExpiresAt,
  signInBodySchema,
} from "@gop/shared";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { generateSessionToken, generateSignInCode, hashSecret } from "./secrets";
import type { AuthStore } from "./store";

export interface AuthDeps {
  authStore: AuthStore;
  /** Key for hashing codes and session tokens. */
  authSecret: string;
  /** Delivers a code. For now it only writes the code to the API log, through `log`. */
  sendSignInCode: (email: string, code: string, log: FastifyBaseLogger) => Promise<void>;
  now: () => Date;
}

const invalidRequest: ErrorResponse = { error: "invalid_request" };
const tooManyRequests: ErrorResponse = { error: "too_many_requests" };
/** One body for every failed sign-in, so a response never hints why it failed. */
const invalidCode: ErrorResponse = { error: "invalid_code" };

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps) {
  const { authStore, authSecret, sendSignInCode, now } = deps;

  app.post("/auth/code", async (request, reply) => {
    const body = requestCodeBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalidRequest);
    }
    const { email } = body.data;
    const createdAt = now();

    const recent = await authStore.countCodesSince(email, codeRequestWindowStart(createdAt));
    if (!canRequestCode(recent)) {
      return reply.code(429).send(tooManyRequests);
    }

    const code = generateSignInCode();
    await authStore.saveCode({
      email,
      codeHash: hashSecret(code, authSecret),
      createdAt,
      expiresAt: codeExpiresAt(createdAt),
    });
    await sendSignInCode(email, code, request.log);
    return reply.code(204).send();
  });

  app.post("/auth/sign-in", async (request, reply) => {
    const body = signInBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(invalidRequest);
    }
    const signedInAt = now();
    const token = generateSessionToken();

    const user = await authStore.signInWithCode({
      email: body.data.email,
      codeHash: hashSecret(body.data.code, authSecret),
      now: signedInAt,
      session: {
        tokenHash: hashSecret(token, authSecret),
        createdAt: signedInAt,
        expiresAt: sessionExpiresAt(signedInAt),
      },
    });
    if (!user) {
      return reply.code(401).send(invalidCode);
    }
    const response: SignInResponse = { token, user };
    return response;
  });
}
