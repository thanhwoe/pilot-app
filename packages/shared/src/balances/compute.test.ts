import { describe, expect, it } from "vitest";
import { splitEqually } from "../expenses/split";
import { type BalanceExpense, computeBalances, suggestSettlements } from "./compute";

// Ids sort as a, b, c, d, so a tie between members has a known winner.
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";

const expense = (
  payerId: string,
  amount: number,
  shares: Record<string, number>,
): BalanceExpense => ({
  payerId,
  amount,
  shares: Object.entries(shares).map(([userId, share]) => ({ userId, amount: share })),
});

/** The balances as `userId → balance`, so a test reads them without caring about their order. */
const byUser = (balances: { userId: string; balance: number }[]) =>
  Object.fromEntries(balances.map((entry) => [entry.userId, entry.balance]));

describe("computeBalances", () => {
  it("#96 AC 1: gives the payer +50000 and the other member -50000 for 100000 split between two", () => {
    const balances = computeBalances([A, B], [expense(A, 100_000, { [A]: 50_000, [B]: 50_000 })]);

    expect(byUser(balances)).toEqual({ [A]: 50_000, [B]: -50_000 });
  });

  it("#96 AC 4: gives every member 0 when there are no expenses", () => {
    expect(byUser(computeBalances([A, B, C], []))).toEqual({ [A]: 0, [B]: 0, [C]: 0 });
  });

  it("#96 A1: lists every member, including one who took no part", () => {
    const balances = computeBalances([C, A, B], [expense(A, 100, { [A]: 50, [B]: 50 })]);

    expect(balances.map((entry) => entry.userId)).toEqual([A, B, C]);
    expect(byUser(balances)[C]).toBe(0);
  });

  it("#96 A2: makes a payer outside the split positive by the full amount, and the others negative", () => {
    const balances = computeBalances(
      [A, B, C],
      [expense(A, 100_000, { [B]: 50_000, [C]: 50_000 })],
    );

    expect(byUser(balances)).toEqual({ [A]: 100_000, [B]: -50_000, [C]: -50_000 });
  });

  it("#96 AC 2: adds up what a member paid and owes over several expenses", () => {
    const balances = computeBalances(
      [A, B, C],
      [
        expense(A, 90_000, { [A]: 30_000, [B]: 30_000, [C]: 30_000 }),
        expense(B, 60_000, { [A]: 30_000, [B]: 30_000 }),
        expense(C, 1, { [A]: 1, [B]: 0 }),
      ],
    );

    // A paid 90000 and owes 30000 + 30000 + 1; B paid 60000 and owes 30000 + 30000 + 0; C paid 1 and owes 30000.
    expect(byUser(balances)).toEqual({ [A]: 29_999, [B]: 0, [C]: -29_999 });
    expect(balances.reduce((sum, entry) => sum + entry.balance, 0)).toBe(0);
  });

  it("#96 AC 2: still adds up to 0 when an expense names someone who is not in the member list", () => {
    const balances = computeBalances([A], [expense(A, 100, { [A]: 50, [B]: 50 })]);

    expect(byUser(balances)).toEqual({ [A]: 50, [B]: -50 });
  });

  it("#96 A3: gives the same balances whatever order the expenses come in", () => {
    const expenses = [
      expense(A, 90_000, { [A]: 30_000, [B]: 30_000, [C]: 30_000 }),
      expense(B, 60_000, { [A]: 30_000, [B]: 30_000 }),
      expense(C, 5_000, { [C]: 5_000 }),
    ];

    expect(computeBalances([A, B, C], [...expenses].reverse())).toEqual(
      computeBalances([A, B, C], expenses),
    );
  });
});

describe("suggestSettlements", () => {
  it("#96 AC 4: suggests nothing when every balance is 0", () => {
    expect(
      suggestSettlements([
        { userId: A, balance: 0 },
        { userId: B, balance: 0 },
      ]),
    ).toEqual([]);
    expect(suggestSettlements([])).toEqual([]);
  });

  it("#96 AC 1: suggests that the member who owes pays the member who is owed", () => {
    expect(
      suggestSettlements([
        { userId: A, balance: 50_000 },
        { userId: B, balance: -50_000 },
      ]),
    ).toEqual([{ from: B, to: A, amount: 50_000 }]);
  });

  it("#96 AC 3: has the largest debt pay the largest credit first", () => {
    const payments = suggestSettlements([
      { userId: A, balance: 10 },
      { userId: B, balance: 4 },
      { userId: C, balance: -7 },
      { userId: D, balance: -7 },
    ]);

    expect(payments).toEqual([
      { from: C, to: A, amount: 7 },
      { from: D, to: B, amount: 4 },
      { from: D, to: A, amount: 3 },
    ]);
  });

  it("#96 A3: breaks a tie between creditors by the lower user id", () => {
    expect(
      suggestSettlements([
        { userId: C, balance: 10 },
        { userId: B, balance: 10 },
        { userId: A, balance: -20 },
      ]),
    ).toEqual([
      { from: A, to: B, amount: 10 },
      { from: A, to: C, amount: 10 },
    ]);
  });

  it("#96 A3: breaks a tie between debtors by the lower user id", () => {
    expect(
      suggestSettlements([
        { userId: A, balance: 20 },
        { userId: D, balance: -10 },
        { userId: C, balance: -10 },
      ]),
    ).toEqual([
      { from: C, to: A, amount: 10 },
      { from: D, to: A, amount: 10 },
    ]);
  });

  it("#96 A3: gives the same payments whatever order the balances come in", () => {
    const balances = [
      { userId: A, balance: 30 },
      { userId: B, balance: -10 },
      { userId: C, balance: -5 },
      { userId: D, balance: -15 },
    ];

    expect(suggestSettlements([...balances].reverse())).toEqual(suggestSettlements(balances));
  });

  it("#96 AC 3: rejects balances that do not add up to 0", () => {
    expect(() =>
      suggestSettlements([
        { userId: A, balance: 10 },
        { userId: B, balance: -9 },
      ]),
    ).toThrow(RangeError);
  });
});

/** A fixed pseudo-random sequence, so a failing case repeats. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("balances of many generated groups", () => {
  it("#96 AC 2, 3, A4: are whole and add up to 0, and the payments zero them within the bound", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const count = 2 + Math.floor(next() * 7);
      const ids = Array.from(
        { length: count },
        (_, index) => `00000000-0000-4000-8000-00000000010${index}`,
      );
      const joinedAt = (index: number) => new Date(Date.UTC(2026, 10, 6, 10, index));
      const expenses: BalanceExpense[] = [];
      for (let made = 0, total = 1 + Math.floor(next() * 6); made < total; made++) {
        const amount = 1 + Math.floor(next() * 100_000_000);
        const payerId = ids[Math.floor(next() * count)] as string;
        let split = ids.filter(() => next() < 0.6);
        if (split.length === 0) {
          split = [ids[Math.floor(next() * count)] as string];
        }
        const shares = splitEqually({
          amount,
          payerId,
          members: split.map((userId) => ({ userId, joinedAt: joinedAt(ids.indexOf(userId)) })),
        });
        expenses.push({ payerId, amount, shares });
      }

      const balances = computeBalances(ids, expenses);
      const payments = suggestSettlements(balances);

      const context = `seed ${seed}`;
      expect(
        balances.map((entry) => entry.userId),
        context,
      ).toEqual([...ids].sort());
      expect(
        balances.every((entry) => Number.isInteger(entry.balance)),
        context,
      ).toBe(true);
      expect(
        balances.reduce((sum, entry) => sum + entry.balance, 0),
        context,
      ).toBe(0);

      const left = byUser(balances);
      for (const payment of payments) {
        expect(Number.isInteger(payment.amount) && payment.amount > 0, context).toBe(true);
        expect(byUser(balances)[payment.from], context).toBeLessThan(0);
        expect(byUser(balances)[payment.to], context).toBeGreaterThan(0);
        left[payment.from] = (left[payment.from] as number) + payment.amount;
        left[payment.to] = (left[payment.to] as number) - payment.amount;
      }
      expect(
        Object.values(left).every((balance) => balance === 0),
        context,
      ).toBe(true);
      const nonZero = balances.filter((entry) => entry.balance !== 0).length;
      expect(payments.length, context).toBeLessThanOrEqual(Math.max(nonZero - 1, 0));
    }
  });
});
