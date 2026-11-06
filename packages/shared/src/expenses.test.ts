import { describe, expect, it } from "vitest";
import {
  createExpenseBodySchema,
  EXPENSE_AMOUNT_MAX,
  EXPENSE_AMOUNT_MIN,
  EXPENSE_DESCRIPTION_MAX_LENGTH,
  expenseListResponseSchema,
  expenseSchema,
} from "./expenses";

const A = "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d";
const B = "1c7a9a6f-8b74-4a2a-8e2f-3a5d2b4c6d7e";

const body = {
  payerId: A,
  amount: 90_000,
  description: "Ăn tối",
  splitBetween: [A, B],
};

describe("createExpenseBodySchema", () => {
  it("#95 AC 1: accepts a payer, an amount, a description and the members to split between", () => {
    expect(createExpenseBodySchema.parse(body)).toEqual(body);
  });

  it("#95 AC 7: accepts 1 VND, 100000000 VND and a description of 200 characters", () => {
    expect(EXPENSE_AMOUNT_MIN).toBe(1);
    expect(EXPENSE_AMOUNT_MAX).toBe(100_000_000);
    expect(EXPENSE_DESCRIPTION_MAX_LENGTH).toBe(200);
    expect(createExpenseBodySchema.safeParse({ ...body, amount: 1 }).success).toBe(true);
    expect(createExpenseBodySchema.safeParse({ ...body, amount: 100_000_000 }).success).toBe(true);
    expect(
      createExpenseBodySchema.safeParse({ ...body, description: "a".repeat(200) }).success,
    ).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["a fraction", 1000.5],
    ["above the maximum", 100_000_001],
    ["not a number", Number.NaN],
    ["a string", "90000"],
    ["missing", undefined],
  ])("#95 AC 6: rejects an amount that is %s", (_case, amount) => {
    expect(createExpenseBodySchema.safeParse({ ...body, amount }).success).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["201 characters", "a".repeat(201)],
    ["missing", undefined],
  ])("#95 AC 6: rejects a description that is %s", (_case, description) => {
    expect(createExpenseBodySchema.safeParse({ ...body, description }).success).toBe(false);
  });

  it("#95 AC 6: counts the 200 characters after trimming", () => {
    const description = ` ${"a".repeat(200)} `;

    expect(createExpenseBodySchema.parse({ ...body, description }).description).toBe(
      "a".repeat(200),
    );
  });

  it("#95 AC 8: trims the spaces around a description", () => {
    expect(createExpenseBodySchema.parse({ ...body, description: "  Ăn tối  " }).description).toBe(
      "Ăn tối",
    );
  });

  it.each([
    ["empty", []],
    ["repeating a member", [A, A]],
    ["naming an id that is not a uuid", [A, "not-an-id"]],
    ["not a list", A],
    ["missing", undefined],
  ])("#95 AC 6, A2: rejects a split that is %s", (_case, splitBetween) => {
    expect(createExpenseBodySchema.safeParse({ ...body, splitBetween }).success).toBe(false);
  });

  it("#95 AC 6: rejects a payer that is not a uuid, and a missing payer", () => {
    expect(createExpenseBodySchema.safeParse({ ...body, payerId: "ana" }).success).toBe(false);
    expect(createExpenseBodySchema.safeParse({ ...body, payerId: undefined }).success).toBe(false);
  });
});

describe("expense responses", () => {
  const expense = {
    id: "2d8b0b70-9c85-4b3b-9f30-4b6e3c5d7e8f",
    groupId: "3e9c1c81-ad96-4c4c-a041-5c7f4d6e8f90",
    payerId: A,
    amount: 90_000,
    description: "Ăn tối",
    createdAt: "2026-11-06T10:00:00.000Z",
    shares: [
      { userId: A, amount: 45_000 },
      { userId: B, amount: 45_000 },
    ],
  };

  it("#95 AC 1: parses an expense with its shares", () => {
    expect(expenseSchema.parse(expense)).toEqual(expense);
  });

  it("#95 AC 7: parses a share of 0 VND, and rejects a negative share", () => {
    const share = { userId: B, amount: 0 };
    expect(expenseSchema.safeParse({ ...expense, shares: [share] }).success).toBe(true);
    expect(
      expenseSchema.safeParse({ ...expense, shares: [{ ...share, amount: -1 }] }).success,
    ).toBe(false);
  });

  it("#95 AC 4, 5: parses a list of expenses, and an empty one", () => {
    expect(expenseListResponseSchema.parse({ expenses: [expense] })).toEqual({
      expenses: [expense],
    });
    expect(expenseListResponseSchema.parse({ expenses: [] })).toEqual({ expenses: [] });
  });
});
