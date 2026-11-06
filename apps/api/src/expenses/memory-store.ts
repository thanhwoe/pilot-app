import { randomUUID } from "node:crypto";
import { byUserId, type ExpenseStore, type StoredExpense } from "./store";

/**
 * An `ExpenseStore` held in memory, for route tests. The contract suite in `store.contract.ts`
 * keeps it in step with the Postgres store.
 */
export function createMemoryExpenseStore(): ExpenseStore {
  const stored: StoredExpense[] = [];

  const copy = (expense: StoredExpense): StoredExpense => ({
    ...expense,
    shares: expense.shares.map((share) => ({ ...share })),
  });

  return {
    async addExpense({ now, shares, ...expense }) {
      const added: StoredExpense = {
        id: randomUUID(),
        ...expense,
        createdAt: now,
        shares: [...shares].sort(byUserId),
      };
      stored.push(added);
      return copy(added);
    },

    async listExpenses(groupId) {
      return stored
        .filter((expense) => expense.groupId === groupId)
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
        .map(copy);
    },
  };
}
