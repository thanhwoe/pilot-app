import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { groupMembers, groups, users } from "../db/schema";
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

  it("#94 AC 8: keeps exactly the hash it was given, and one hash cannot belong to two groups", async () => {
    const creatorId = await insertUser(testDb);
    const store = createPostgresGroupStore(testDb.database.db);
    const now = new Date("2026-11-06T10:00:00Z");
    const first = await store.createGroup({ name: "Một", creatorId, now });
    const second = await store.createGroup({ name: "Hai", creatorId, now });

    await store.setInviteTokenHash(first.id, "a-hash");

    const rows = await testDb.database.db
      .select({ id: groups.id, hash: groups.inviteTokenHash })
      .from(groups);
    expect(rows).toContainEqual({ id: first.id, hash: "a-hash" });
    expect(rows).toContainEqual({ id: second.id, hash: null });
    await expect(store.setInviteTokenHash(second.id, "a-hash")).rejects.toThrow();
  });
});
