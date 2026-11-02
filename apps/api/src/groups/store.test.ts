import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { groupMembers, users } from "../db/schema";
import { createTestDb, type TestDb } from "../test/db";
import { createPostgresGroupStore } from "./store";
import { describeGroupStoreContract } from "./store.contract";

async function insertUser(testDb: TestDb): Promise<string> {
  const [user] = await testDb.database.db
    .insert(users)
    .values({ email: `${randomUUID()}@example.com`, createdAt: new Date() })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("Inserting the user returned no row");
  }
  return user.id;
}

describeGroupStoreContract("Postgres", async () => {
  const testDb = await createTestDb();
  return {
    store: createPostgresGroupStore(testDb.database.db),
    newUser: () => insertUser(testDb),
    async addMember(groupId, userId, now) {
      await testDb.database.db.insert(groupMembers).values({ groupId, userId, joinedAt: now });
    },
    close: testDb.drop,
  };
});

describe("Postgres GroupStore storage", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("saves exactly one membership, the creator's, with a new group (AC 1)", async () => {
    const creatorId = await insertUser(testDb);
    const now = new Date("2026-11-02T10:00:00Z");

    const group = await createPostgresGroupStore(testDb.database.db).createGroup({
      name: "Đà Lạt",
      creatorId,
      now,
    });

    expect(await testDb.database.db.select().from(groupMembers)).toEqual([
      { groupId: group.id, userId: creatorId, joinedAt: now },
    ]);
  });
});
