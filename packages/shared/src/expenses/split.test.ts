import { describe, expect, it } from "vitest";
import { type SplitMember, splitEqually } from "./split";

// Ids sort as a, b, c, so a tie in `joinedAt` has a known winner.
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const D = "00000000-0000-4000-8000-00000000000d";

const joined = (userId: string, minute: number): SplitMember => ({
  userId,
  joinedAt: new Date(Date.UTC(2026, 10, 2, 10, minute)),
});

/** The shares as `userId → amount`, so a test reads them without caring about their order. */
function byUser(shares: { userId: string; amount: number }[]) {
  return Object.fromEntries(shares.map((share) => [share.userId, share.amount]));
}

describe("splitEqually", () => {
  it("#95 AC 1: gives three members 30000 each of 90000", () => {
    const shares = splitEqually({
      amount: 90_000,
      payerId: A,
      members: [joined(A, 0), joined(B, 1), joined(C, 2)],
    });

    expect(byUser(shares)).toEqual({ [A]: 30_000, [B]: 30_000, [C]: 30_000 });
  });

  it("#95 AC 2: gives the extra VND of 100000 between three to the payer, then by join order", () => {
    const shares = splitEqually({
      amount: 100_000,
      payerId: A,
      members: [joined(A, 0), joined(B, 1), joined(C, 2)],
    });

    expect(byUser(shares)).toEqual({ [A]: 33_334, [B]: 33_333, [C]: 33_333 });
  });

  it("#95 AC 2: gives the payer the first extra VND even when they joined last", () => {
    const shares = splitEqually({
      amount: 100_000,
      payerId: C,
      members: [joined(A, 0), joined(B, 1), joined(C, 2)],
    });

    expect(byUser(shares)).toEqual({ [A]: 33_333, [B]: 33_333, [C]: 33_334 });
  });

  it("#95 AC 2: hands out a remainder of 2 to the payer and then the first joiner", () => {
    const shares = splitEqually({
      amount: 100_001,
      payerId: C,
      members: [joined(A, 0), joined(B, 1), joined(C, 2)],
    });

    expect(byUser(shares)).toEqual({ [A]: 33_334, [B]: 33_333, [C]: 33_334 });
  });

  it("#95 AC 3: leaves a payer outside the split with no share", () => {
    const shares = splitEqually({
      amount: 100_000,
      payerId: A,
      members: [joined(B, 1), joined(C, 2)],
    });

    expect(byUser(shares)).toEqual({ [B]: 50_000, [C]: 50_000 });
  });

  it("#95 AC 3: gives the extra VND of 100001 to the member who joined first", () => {
    const shares = splitEqually({
      amount: 100_001,
      payerId: A,
      members: [joined(B, 1), joined(C, 2)],
    });

    expect(byUser(shares)).toEqual({ [B]: 50_001, [C]: 50_000 });
  });

  it("#95 AC 2: breaks a tie in joining time by the lower user id", () => {
    const shares = splitEqually({
      amount: 100_001,
      payerId: A,
      members: [joined(C, 1), joined(B, 1)],
    });

    expect(byUser(shares)).toEqual({ [B]: 50_001, [C]: 50_000 });
  });

  it("#95 A3: gives the same shares whatever order the request lists the members in", () => {
    const members = [joined(A, 0), joined(B, 1), joined(C, 2), joined(D, 3)];
    const expected = byUser(splitEqually({ amount: 100_002, payerId: C, members }));

    for (const order of [
      [3, 2, 1, 0],
      [1, 3, 0, 2],
      [2, 0, 3, 1],
    ]) {
      const shuffled = order.map((index) => members[index] as SplitMember);
      expect(byUser(splitEqually({ amount: 100_002, payerId: C, members: shuffled }))).toEqual(
        expected,
      );
    }
  });

  it("#95 AC 1: gives one member the whole amount", () => {
    expect(splitEqually({ amount: 12_345, payerId: A, members: [joined(A, 0)] })).toEqual([
      { userId: A, amount: 12_345 },
    ]);
  });

  it("#95 AC 7: keeps a share of 0 for a member when 1 VND is split three ways", () => {
    const shares = splitEqually({
      amount: 1,
      payerId: A,
      members: [joined(A, 0), joined(B, 1), joined(C, 2)],
    });

    expect(byUser(shares)).toEqual({ [A]: 1, [B]: 0, [C]: 0 });
  });

  it("#95 AC 2: gives whole VND that add up to the amount, within 1 VND of each other", () => {
    const people = Array.from(
      { length: 9 },
      (_, index) => `00000000-0000-4000-8000-0000000001${index}0`,
    );
    for (let amount = 1; amount <= 500; amount++) {
      for (let count = 1; count <= 9; count++) {
        const members = people.slice(0, count).map((userId, index) => joined(userId, index));
        const payerId = people[amount % 9] as string;

        const shares = splitEqually({ amount, payerId, members });

        const amounts = shares.map((share) => share.amount);
        expect(shares.map((share) => share.userId).sort()).toEqual(
          members.map((member) => member.userId).sort(),
        );
        expect(amounts.every(Number.isInteger)).toBe(true);
        expect(amounts.reduce((sum, share) => sum + share, 0)).toBe(amount);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("#95 AC 7: splits the largest amount without losing a VND", () => {
    const shares = splitEqually({
      amount: 100_000_000,
      payerId: A,
      members: [joined(A, 0), joined(B, 1), joined(C, 2)],
    });

    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(100_000_000);
  });

  it("rejects an amount that is not a positive whole number, and an empty or repeated split", () => {
    const members = [joined(A, 0), joined(B, 1)];

    expect(() => splitEqually({ amount: 0, payerId: A, members })).toThrow(RangeError);
    expect(() => splitEqually({ amount: 10.5, payerId: A, members })).toThrow(RangeError);
    expect(() => splitEqually({ amount: 10, payerId: A, members: [] })).toThrow(RangeError);
    expect(() =>
      splitEqually({ amount: 10, payerId: A, members: [joined(A, 0), joined(A, 1)] }),
    ).toThrow(RangeError);
  });
});
