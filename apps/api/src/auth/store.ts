import {
  canRequestCode,
  codeExpiresAt,
  codeRequestWindowStart,
  isCodeUsable,
  isSessionValid,
  type User,
} from "@gop/shared";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, signInCodes, users } from "../db/schema";
import { hashesMatch } from "./secrets";

export interface CodeRequest {
  email: string;
  codeHash: string;
  now: Date;
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
  /**
   * Saves a new code for the email unless it already had 5 in the last 15 minutes, checking and
   * saving at once so parallel requests can't get past the limit. Each code is created after the
   * previous one, so the newest is never ambiguous. Returns false when the limit is reached.
   */
  issueCode(request: CodeRequest): Promise<boolean>;
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

/** `now`, or 1 ms after the previous code when that isn't earlier, so codes never share a time. */
export function nextCodeTime(previous: Date | undefined, now: Date): Date {
  return previous && previous >= now ? new Date(previous.getTime() + 1) : now;
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

    issueCode({ email, codeHash, now }) {
      return db.transaction(async (tx) => {
        // One code request per email at a time, until this transaction ends.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

        const [recent] = await tx
          .select({ count: count() })
          .from(signInCodes)
          .where(
            and(
              eq(signInCodes.email, email),
              gte(signInCodes.createdAt, codeRequestWindowStart(now)),
            ),
          );
        if (!canRequestCode(recent?.count ?? 0)) {
          return false;
        }

        const [latest] = await tx
          .select({ createdAt: signInCodes.createdAt })
          .from(signInCodes)
          .where(eq(signInCodes.email, email))
          .orderBy(desc(signInCodes.createdAt))
          .limit(1);
        const createdAt = nextCodeTime(latest?.createdAt, now);
        await tx
          .insert(signInCodes)
          .values({ email, codeHash, createdAt, expiresAt: codeExpiresAt(createdAt) });
        return true;
      });
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
