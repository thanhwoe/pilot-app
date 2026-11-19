// #148 QA: the shared balance function with settlements, from the spec only.
import { describe, expect, it } from "vitest";
import { computeBalances, suggestSettlements } from "./balances/compute";

const A = "00000000-0000-4000-8000-00000000000a";
const X = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

// A owes X 20000: X paid 40000 split between A and X.
const expenses = [
  {
    payerId: X,
    amount: 40_000,
    shares: [
      { userId: A, amount: 20_000 },
      { userId: X, amount: 20_000 },
    ],
  },
];
// QA guess: settlements are the third argument, shaped { payerId, payeeId, amount }.
const settle = (payerId: string, payeeId: string, amount: number) => ({
  payerId,
  payeeId,
  amount,
});
const byUser = (b: { userId: string; balance: number }[]) =>
  Object.fromEntries(b.map((e) => [e.userId, e.balance]));

describe("computeBalances with settlements", () => {
  it("#148 QA AC 4: a settlement of the whole debt gives 0 for both and no suggestions", () => {
    const balances = computeBalances([A, X], expenses, [settle(A, X, 20_000)]);

    expect(byUser(balances)).toEqual({ [A]: 0, [X]: 0 });
    expect(suggestSettlements(balances)).toEqual([]);
  });

  it("#148 QA AC 5: raises the payer, lowers the payee, and the sum stays 0", () => {
    const balances = computeBalances([A, X, C], expenses, [settle(A, X, 5_000)]);

    expect(byUser(balances)).toEqual({ [A]: -15_000, [X]: 15_000, [C]: 0 });
    expect(balances.reduce((s, e) => s + e.balance, 0)).toBe(0);
  });

  it("#148 QA AC 5: with no settlements the result is what expenses alone give", () => {
    expect(byUser(computeBalances([A, X], expenses, []))).toEqual({ [A]: -20_000, [X]: 20_000 });
  });
});
