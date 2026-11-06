import { z } from "zod";

/** The smallest and largest amount of one expense, in whole VND (100 triệu). */
export const EXPENSE_AMOUNT_MIN = 1;
export const EXPENSE_AMOUNT_MAX = 100_000_000;
export const EXPENSE_DESCRIPTION_MAX_LENGTH = 200;

/** An expense amount in whole VND: an integer from 1 to 100,000,000. */
export const expenseAmountSchema = z.int().min(EXPENSE_AMOUNT_MIN).max(EXPENSE_AMOUNT_MAX);

/** A description as the API stores it: trimmed, 1 to 200 characters. */
export const expenseDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(EXPENSE_DESCRIPTION_MAX_LENGTH);

/**
 * Body of `POST /groups/:id/expenses`: who paid, how much, what for, and the members it is split
 * equally between. The split lists each member once and has at least one.
 */
export const createExpenseBodySchema = z.object({
  payerId: z.uuid(),
  amount: expenseAmountSchema,
  description: expenseDescriptionSchema,
  splitBetween: z
    .array(z.uuid())
    .min(1)
    .refine((userIds) => new Set(userIds).size === userIds.length),
});

export type CreateExpenseBody = z.infer<typeof createExpenseBodySchema>;

/** One member's part of an expense, in whole VND. A member of the split can hold 0 VND. */
export const expenseShareSchema = z.object({
  userId: z.uuid(),
  amount: z.int().nonnegative(),
});

export type ExpenseShare = z.infer<typeof expenseShareSchema>;

export const expenseSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  payerId: z.uuid(),
  amount: expenseAmountSchema,
  description: z.string(),
  createdAt: z.iso.datetime(),
  /** Ordered by `userId`, ascending. A payer outside the split has no share. */
  shares: z.array(expenseShareSchema),
});

export type Expense = z.infer<typeof expenseSchema>;

/** Response of `POST /groups/:id/expenses` (201). */
export const expenseResponseSchema = expenseSchema;

export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;

/** Response of `GET /groups/:id/expenses`: the group's expenses, newest first. */
export const expenseListResponseSchema = z.object({
  expenses: z.array(expenseSchema),
});

export type ExpenseListResponse = z.infer<typeof expenseListResponseSchema>;
