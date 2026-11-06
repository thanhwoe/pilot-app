import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "../db/schema";
import { createPostgresGroupStore } from "../groups/store";
import { createTestDb, type TestDb } from "../test/db";
import { createPostgresExpenseStore } from "./store";
import { describeExpenseStoreContract } from "./store.contract";

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

async function insertGroup(testDb: TestDb, creatorId: string): Promise<string> {
  const group = await createPostgresGroupStore(testDb.database.db).createGroup({
    name: "Nhóm",
    creatorId,
    now: new Date("2026-11-06T09:00:00Z"),
  });
  return group.id;
}

describeExpenseStoreContract("Postgres", async () => {
  const testDb = await createTestDb();
  return {
    store: createPostgresExpenseStore(testDb.database.db),
    newUser: () => insertUser(testDb),
    newGroup: (creatorId) => insertGroup(testDb, creatorId),
    close: testDb.drop,
  };
});

describe("Postgres ExpenseStore storage", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("#95 AC 6: stores nothing when one of the shares cannot be saved", async () => {
    const ana = await insertUser(testDb);
    const groupId = await insertGroup(testDb, ana);
    const store = createPostgresExpenseStore(testDb.database.db);

    await expect(
      store.addExpense({
        groupId,
        payerId: ana,
        amount: 90_000,
        description: "Ăn tối",
        shares: [
          { userId: ana, amount: 45_000 },
          { userId: randomUUID(), amount: 45_000 },
        ],
        now: new Date("2026-11-06T10:00:00Z"),
      }),
    ).rejects.toThrow();

    expect(await store.listExpenses(groupId)).toEqual([]);
  });
});
