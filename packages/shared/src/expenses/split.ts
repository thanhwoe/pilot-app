import type { ExpenseShare } from "../expenses";

/** A member of an expense's split, and when they joined the group. */
export interface SplitMember {
  userId: string;
  joinedAt: Date;
}

export interface SplitInput {
  /** Whole VND, at least 1. */
  amount: number;
  payerId: string;
  /** The members the expense is split between, each once, in any order. */
  members: SplitMember[];
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Splits an amount equally in whole VND. Each member gets the amount divided by the number of
 * members, rounded down. The remainder (at most one VND less than the number of members) goes
 * 1 VND at a time to the payer if they are in the split, then to the others in the order they
 * joined the group, then by user id when they joined together. The order of `members` does not
 * matter. The shares come back in that hand-out order and always add up to `amount`.
 */
export function splitEqually({ amount, payerId, members }: SplitInput): ExpenseShare[] {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new RangeError("An expense amount is a whole number of VND, at least 1");
  }
  if (members.length === 0) {
    throw new RangeError("A split needs at least one member");
  }
  if (new Set(members.map((member) => member.userId)).size !== members.length) {
    throw new RangeError("A split lists each member once");
  }

  const handOutOrder = [...members].sort((a, b) => {
    if (a.userId === payerId || b.userId === payerId) {
      return a.userId === payerId ? -1 : 1;
    }
    return a.joinedAt.getTime() - b.joinedAt.getTime() || compareIds(a.userId, b.userId);
  });
  const base = Math.floor(amount / members.length);
  const remainder = amount % members.length;

  return handOutOrder.map(({ userId }, index) => ({
    userId,
    amount: base + (index < remainder ? 1 : 0),
  }));
}
