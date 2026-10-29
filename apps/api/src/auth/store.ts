import { isCodeUsable, isSessionValid, type User } from "@gop/shared";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, signInCodes, users } from "../db/schema";
import { hashesMatch } from "./secrets";

export interface NewSignInCode {
  email: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface SignInAttempt {
  email: string;
  codeHash: string;
  now: Date;
  /** The session to create when the code is right. */
  session: { tokenHash: string; createdAt: Date; expiresAt: Date };
}

/** Persistence for sign-in. Holds only hashes of codes and tokens. */
export interface AuthStore {
  countCodesSince(email: string, since: Date): Promise<number>;
  saveCode(code: NewSignInCode): Promise<void>;
  /**
   * Checks the code against the newest one for the email. When it's right and still usable,
   * marks it used, creates the account if needed and saves the session, all at once.
   * A wrong code counts as an attempt. Returns null whenever sign-in fails.
   */
  signInWithCode(attempt: SignInAttempt): Promise<User | null>;
  findSessionUser(tokenHash: string, now: Date): Promise<User | null>;
  /** Returns false when there was no such session. */
  deleteSession(tokenHash: string): Promise<boolean>;
}

export function createPostgresAuthStore(db: Database["db"]): AuthStore {
  return {
    async countCodesSince(email, since) {
      const [row] = await db
        .select({ count: count() })
        .from(signInCodes)
        .where(and(eq(signInCodes.email, email), gte(signInCodes.createdAt, since)));
      return row?.count ?? 0;
    },

    async saveCode(code) {
      await db.insert(signInCodes).values(code);
    },

    signInWithCode({ email, codeHash, now, session }) {
      return db.transaction(async (tx) => {
        // Lock the newest code so two requests with the same code can't both use it.
        const [code] = await tx
          .select()
          .from(signInCodes)
          .where(eq(signInCodes.email, email))
          .orderBy(desc(signInCodes.createdAt))
          .limit(1)
          .for("update");

        if (!code || !isCodeUsable(code, now)) {
          return null;
        }
        if (!hashesMatch(code.codeHash, codeHash)) {
          await tx
            .update(signInCodes)
            .set({ attempts: sql`${signInCodes.attempts} + 1` })
            .where(eq(signInCodes.id, code.id));
          return null;
        }

        await tx.update(signInCodes).set({ usedAt: now }).where(eq(signInCodes.id, code.id));
        const [user] = await tx
          .insert(users)
          .values({ email, createdAt: now })
          .onConflictDoUpdate({ target: users.email, set: { email } })
          .returning({ id: users.id, email: users.email });
        if (!user) {
          throw new Error("Upserting the user returned no row");
        }
        await tx.insert(sessions).values({ ...session, userId: user.id });
        return user;
      });
    },

    async findSessionUser(tokenHash, now) {
      const [row] = await db
        .select({ id: users.id, email: users.email, expiresAt: sessions.expiresAt })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.tokenHash, tokenHash));
      if (!row || !isSessionValid(row, now)) {
        return null;
      }
      return { id: row.id, email: row.email };
    },

    async deleteSession(tokenHash) {
      const deleted = await db
        .delete(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .returning({ id: sessions.id });
      return deleted.length > 0;
    },
  };
}
