import type { User } from "@gop/shared";
import type { FastifyRequest } from "fastify";
import { hashSecret } from "./secrets";
import type { AuthStore } from "./store";

export interface SessionDeps {
  authStore: AuthStore;
  authSecret: string;
  now: () => Date;
}

/** The request's live session: its token hash and its user. */
export interface Session {
  tokenHash: string;
  user: User;
}

/** The token from `Authorization: Bearer <token>`, or null. */
function bearerToken(request: FastifyRequest): string | null {
  const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "");
  return match?.[1] ?? null;
}

/**
 * The session check every signed-in route uses: the request's session, or null when there is no
 * token, the token is unknown or the session has expired. Routes answer null with 401.
 */
export function createSessionCheck({ authStore, authSecret, now }: SessionDeps) {
  return async function findSession(request: FastifyRequest): Promise<Session | null> {
    const token = bearerToken(request);
    if (!token) {
      return null;
    }
    const tokenHash = hashSecret(token, authSecret);
    const user = await authStore.findSessionUser(tokenHash, now());
    return user ? { tokenHash, user } : null;
  };
}
