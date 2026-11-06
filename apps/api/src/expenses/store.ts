import type { ExpenseShare } from "@gop/shared";
import { desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { expenseShares, expenses } from "../db/schema";

/** An expense as the store returns it. Routes turn `createdAt` into the shared ISO string. */
export interface StoredExpense {
  id: string;
  groupId: string;
  payerId: string;
  amount: number;
  description: string;
  createdAt: Date;
  /** Ordered by `userId`, ascending. */
  shares: ExpenseShare[];
}

export interface NewExpense {
  groupId: string;
  payerId: string;
  amount: number;
  description: string;
  /** What each member of the split owes, already worked out. The store does not check them. */
  shares: ExpenseShare[];
  now: Date;
}

/** Persistence for expenses and their shares. */
export interface ExpenseStore {
  /** Saves the expense and all its shares at once, so an expense never lacks a share. */
  addExpense(expense: NewExpense): Promise<StoredExpense>;
  /** A group's expenses, newest first; ties in creation time go by id, descending. */
  listExpenses(groupId: string): Promise<StoredExpense[]>;
}

export const byUserId = (a: ExpenseShare, b: ExpenseShare) =>
  a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;

export function createPostgresExpenseStore(db: Database["db"]): ExpenseStore {
  return {
    addExpense({ groupId, payerId, amount, description, shares, now }) {
      return db.transaction(async (tx) => {
        const [expense] = await tx
          .insert(expenses)
          .values({ groupId, payerId, amount, description, createdAt: now })
          .returning();
        if (!expense) {
          throw new Error("Inserting the expense returned no row");
        }
        if (shares.length > 0) {
          await tx
            .insert(expenseShares)
            .values(shares.map((share) => ({ expenseId: expense.id, ...share })));
        }
        return { ...expense, shares: [...shares].sort(byUserId) };
      });
    },

    async listExpenses(groupId) {
      const rows = await db
        .select()
        .from(expenses)
        .where(eq(expenses.groupId, groupId))
        .orderBy(desc(expenses.createdAt), desc(expenses.id));
      if (rows.length === 0) {
        return [];
      }
      const shareRows = await db
        .select()
        .from(expenseShares)
        .where(
          inArray(
            expenseShares.expenseId,
            rows.map((row) => row.id),
          ),
        );
      return rows.map((row) => ({
        ...row,
        shares: shareRows
          .filter((share) => share.expenseId === row.id)
          .map(({ userId, amount }) => ({ userId, amount }))
          .sort(byUserId),
      }));
    },
  };
}
