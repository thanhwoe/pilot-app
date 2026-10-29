import { codeExpiresAt, sessionExpiresAt } from "@gop/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessions, signInCodes } from "../db/schema";
import { createTestDb, type TestDb } from "../test/db";
import { generateSessionToken, generateSignInCode, hashSecret } from "./secrets";
import { createPostgresAuthStore } from "./store";
import { describeAuthStoreContract } from "./store.contract";

describeAuthStoreContract("Postgres", async () => {
  const testDb = await createTestDb();
  return { store: createPostgresAuthStore(testDb.database.db), close: testDb.drop };
});

describe("Postgres AuthStore storage", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("keeps no plain-text code or session token", async () => {
    const secret = "test-secret-that-is-at-least-32-characters";
    const store = createPostgresAuthStore(testDb.database.db);
    const now = new Date("2026-10-29T10:00:00Z");
    const code = generateSignInCode();
    const token = generateSessionToken();

    await store.saveCode({
      email: "plain@example.com",
      codeHash: hashSecret(code, secret),
      createdAt: now,
      expiresAt: codeExpiresAt(now),
    });
    await store.signInWithCode({
      email: "plain@example.com",
      codeHash: hashSecret(code, secret),
      now,
      session: {
        tokenHash: hashSecret(token, secret),
        createdAt: now,
        expiresAt: sessionExpiresAt(now),
      },
    });

    const stored = JSON.stringify([
      await testDb.database.db.select().from(signInCodes),
      await testDb.database.db.select().from(sessions),
    ]);
    expect(stored).not.toContain(code);
    expect(stored).not.toContain(token);
  });
});
