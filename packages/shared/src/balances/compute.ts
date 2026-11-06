import type { MemberBalance, SuggestedPayment } from "../balances";
import type { ExpenseShare } from "../expenses";

/** The part of an expense that balances need: who paid, how much, and what each member owes. */
export interface BalanceExpense {
  payerId: string;
  amount: number;
  shares: ExpenseShare[];
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Each member's balance over a group's expenses: what they paid minus the sum of their shares.
 * It covers `memberIds` and anyone an expense names, so the balances always add up to exactly 0.
 * The result is ordered by user id, whatever order the expenses came in.
 */
export function computeBalances(memberIds: string[], expenses: BalanceExpense[]): MemberBalance[] {
  const balances = new Map<string, number>(memberIds.map((userId) => [userId, 0]));
  const add = (userId: string, amount: number) =>
    balances.set(userId, (balances.get(userId) ?? 0) + amount);

  for (const { payerId, amount, shares } of expenses) {
    add(payerId, amount);
    for (const share of shares) {
      add(share.userId, -share.amount);
    }
  }

  return [...balances]
    .map(([userId, balance]) => ({ userId, balance }))
    .sort((a, b) => compareIds(a.userId, b.userId));
}

interface Open {
  userId: string;
  left: number;
}

/** The person with the most left; a tie goes to the lower user id. */
const largest = (people: Open[]): Open =>
  people.reduce((best, person) =>
    person.left > best.left || (person.left === best.left && person.userId < best.userId)
      ? person
      : best,
  );

/**
 * The payments that bring every balance to 0. The member who owes the most pays the member who is
 * owed the most, as much as either can; then again with what is left. A tie goes to the lower user
 * id, so the same balances always give the same payments. Each payment settles at least one
 * member, and the last settles two, so there are at most (members with a balance other than 0)
 * − 1 payments. That is not always the fewest possible.
 */
export function suggestSettlements(balances: MemberBalance[]): SuggestedPayment[] {
  if (balances.reduce((sum, entry) => sum + entry.balance, 0) !== 0) {
    throw new RangeError("Balances must add up to 0");
  }
  const owing: Open[] = balances
    .filter((entry) => entry.balance < 0)
    .map((entry) => ({ userId: entry.userId, left: -entry.balance }));
  const owed: Open[] = balances
    .filter((entry) => entry.balance > 0)
    .map((entry) => ({ userId: entry.userId, left: entry.balance }));
  const payments: SuggestedPayment[] = [];

  while (owing.length > 0 && owed.length > 0) {
    const from = largest(owing);
    const to = largest(owed);
    const amount = Math.min(from.left, to.left);
    payments.push({ from: from.userId, to: to.userId, amount });
    from.left -= amount;
    to.left -= amount;
    for (const people of [owing, owed]) {
      const settled = people.findIndex((person) => person.left === 0);
      if (settled !== -1) {
        people.splice(settled, 1);
      }
    }
  }
  return payments;
}
