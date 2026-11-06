import { describe, expect, it } from "vitest";
import { balancesResponseSchema, memberBalanceSchema, suggestedPaymentSchema } from "./balances";

const A = "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d";
const B = "1c7a9a6f-8b74-4a2a-8e2f-3a5d2b4c6d7e";

describe("balances responses", () => {
  it("#96 AC 1: parses balances and the payments that settle them", () => {
    const body = {
      balances: [
        { userId: A, balance: 50_000 },
        { userId: B, balance: -50_000 },
      ],
      suggestions: [{ from: B, to: A, amount: 50_000 }],
    };

    expect(balancesResponseSchema.parse(body)).toEqual(body);
  });

  it("#96 AC 4: parses members at 0 with no suggestions", () => {
    const body = {
      balances: [
        { userId: A, balance: 0 },
        { userId: B, balance: 0 },
      ],
      suggestions: [],
    };

    expect(balancesResponseSchema.parse(body)).toEqual(body);
  });

  it("#96 AC 2: rejects a balance that is not a whole number of VND", () => {
    expect(memberBalanceSchema.safeParse({ userId: A, balance: 10.5 }).success).toBe(false);
    expect(memberBalanceSchema.safeParse({ userId: A, balance: -3 }).success).toBe(true);
  });

  it("#96 A4: rejects a suggestion of 0 VND, a negative one and one that is not whole", () => {
    for (const amount of [0, -5, 2.5]) {
      expect(suggestedPaymentSchema.safeParse({ from: A, to: B, amount }).success).toBe(false);
    }
    expect(suggestedPaymentSchema.safeParse({ from: A, to: B, amount: 1 }).success).toBe(true);
  });
});
