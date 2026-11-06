import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExpenseStore } from "./store";

const minute = 60_000;
const t0 = new Date("2026-11-06T10:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

export interface ExpenseStoreHarness {
  store: ExpenseStore;
  /** Creates a user the store can name as a payer or a share holder, and returns its id. */
  newUser: () => Promise<string>;
  /** Creates a group the store can hold expenses for, and returns its id. */
  newGroup: (creatorId: string) => Promise<string>;
  close: () => Promise<void>;
}

const byId = (a: { userId: string }, b: { userId: string }) => (a.userId < b.userId ? -1 : 1);

/**
 * The behaviour every `ExpenseStore` must have. Runs against Postgres and the in-memory fake, so
 * route tests that use the fake see what production sees.
 */
export function describeExpenseStoreContract(
  name: string,
  open: () => Promise<ExpenseStoreHarness>,
) {
  describe(`${name} ExpenseStore`, () => {
    let harness: ExpenseStoreHarness;
    let store: ExpenseStore;

    beforeAll(async () => {
      harness = await open();
      store = harness.store;
    });

    afterAll(async () => {
      await harness.close();
    });

    /** A group with three users, and a way to add an expense for them. */
    async function setup() {
      const ana = await harness.newUser();
      const bao = await harness.newUser();
      const cy = await harness.newUser();
      const groupId = await harness.newGroup(ana);
      return {
        ana,
        bao,
        cy,
        groupId,
        add(now: Date, description = "Ăn tối", amount = 90_000) {
          return store.addExpense({
            groupId,
            payerId: ana,
            amount,
            description,
            shares: [
              { userId: ana, amount: amount / 3 },
              { userId: bao, amount: amount / 3 },
              { userId: cy, amount: amount / 3 },
            ],
            now,
          });
        },
      };
    }

    it("#95 AC 1: stores an expense with its payer, amount, description, time and shares", async () => {
      const { ana, bao, cy, groupId, add } = await setup();

      const expense = await add(t0);

      expect(expense).toEqual({
        id: expect.any(String),
        groupId,
        payerId: ana,
        amount: 90_000,
        description: "Ăn tối",
        createdAt: t0,
        shares: [
          { userId: ana, amount: 30_000 },
          { userId: bao, amount: 30_000 },
          { userId: cy, amount: 30_000 },
        ].sort(byId),
      });
      expect(await store.listExpenses(groupId)).toEqual([expense]);
    });

    it("#95 AC 1: orders the shares by user id, whatever order they were given in", async () => {
      const { ana, bao, cy, groupId } = await setup();

      const expense = await store.addExpense({
        groupId,
        payerId: bao,
        amount: 100_000,
        description: "Taxi",
        shares: [
          { userId: cy, amount: 33_333 },
          { userId: bao, amount: 33_334 },
          { userId: ana, amount: 33_333 },
        ],
        now: t0,
      });

      expect(expense.shares.map((share) => share.userId)).toEqual([ana, bao, cy].sort());
    });

    it("#95 AC 3: stores no share for a payer who is outside the split", async () => {
      const { ana, bao, cy, groupId } = await setup();

      const expense = await store.addExpense({
        groupId,
        payerId: ana,
        amount: 100_000,
        description: "Vé",
        shares: [
          { userId: bao, amount: 50_000 },
          { userId: cy, amount: 50_000 },
        ],
        now: t0,
      });

      expect(expense.shares.map((share) => share.userId).sort()).toEqual([bao, cy].sort());
    });

    it("#95 AC 7: keeps a share of 0 VND", async () => {
      const { ana, bao, groupId } = await setup();

      const expense = await store.addExpense({
        groupId,
        payerId: ana,
        amount: 1,
        description: "Kẹo",
        shares: [
          { userId: ana, amount: 1 },
          { userId: bao, amount: 0 },
        ],
        now: t0,
      });

      expect(expense.shares).toContainEqual({ userId: bao, amount: 0 });
    });

    it("#95 AC 4: lists a group's expenses newest first, and no other group's", async () => {
      const { ana, groupId, add } = await setup();
      const otherGroupId = await harness.newGroup(ana);
      const older = await add(t0, "Cũ");
      const newer = await add(at(minute), "Mới");
      await store.addExpense({
        groupId: otherGroupId,
        payerId: ana,
        amount: 5_000,
        description: "Nhóm khác",
        shares: [{ userId: ana, amount: 5_000 }],
        now: at(2 * minute),
      });

      expect(await store.listExpenses(groupId)).toEqual([newer, older]);
    });

    it("#95 A5: breaks a tie in creation time by id, descending, the same way every time", async () => {
      const { groupId, add } = await setup();
      const first = await add(t0, "Một");
      const second = await add(t0, "Hai");

      const expected = [first, second].sort((x, y) => (x.id < y.id ? 1 : -1));
      expect(await store.listExpenses(groupId)).toEqual(expected);
      expect(await store.listExpenses(groupId)).toEqual(expected);
    });

    it("#95 AC 5: lists no expenses for a group that has none", async () => {
      const { groupId } = await setup();

      expect(await store.listExpenses(groupId)).toEqual([]);
      expect(await store.listExpenses(randomUUID())).toEqual([]);
    });
  });
}
