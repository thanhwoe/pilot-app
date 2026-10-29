import { randomUUID } from "node:crypto";
import { isCodeUsable, isSessionValid, type User } from "@gop/shared";
import { hashesMatch } from "./secrets";
import type { AuthStore, NewSignInCode } from "./store";

interface StoredCode extends NewSignInCode {
  attempts: number;
  usedAt: Date | null;
}

/**
 * An `AuthStore` held in memory, for route tests. The contract suite in `store.contract.ts`
 * keeps it in step with the Postgres store.
 */
export function createMemoryAuthStore(): AuthStore {
  const codes: StoredCode[] = [];
  const usersByEmail = new Map<string, User>();
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();

  return {
    async countCodesSince(email, since) {
      return codes.filter((code) => code.email === email && code.createdAt >= since).length;
    },

    async saveCode(code) {
      codes.push({ ...code, attempts: 0, usedAt: null });
    },

    // No await inside, so two calls can't interleave: the same guarantee the row lock gives.
    async signInWithCode({ email, codeHash, now, session }) {
      const code = codes
        .filter((candidate) => candidate.email === email)
        .reduce<StoredCode | undefined>(
          (newest, candidate) =>
            !newest || candidate.createdAt > newest.createdAt ? candidate : newest,
          undefined,
        );

      if (!code || !isCodeUsable(code, now)) {
        return null;
      }
      if (!hashesMatch(code.codeHash, codeHash)) {
        code.attempts += 1;
        return null;
      }

      code.usedAt = now;
      let user = usersByEmail.get(email);
      if (!user) {
        user = { id: randomUUID(), email };
        usersByEmail.set(email, user);
      }
      sessions.set(session.tokenHash, { userId: user.id, expiresAt: session.expiresAt });
      return user;
    },

    async findSessionUser(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || !isSessionValid(session, now)) {
        return null;
      }
      return [...usersByEmail.values()].find((user) => user.id === session.userId) ?? null;
    },

    async deleteSession(tokenHash) {
      return sessions.delete(tokenHash);
    },
  };
}
