import { describe, expect, it } from "vitest";
import { createSettlementBodySchema, settlementResponseSchema } from "./settlements";

const payer = "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f";
const payee = "7a2d2e3f-9c8b-4d4e-8f1a-2b3c4d5e6f70";
const body = (amount: number, payerId = payer, payeeId = payee) => ({ payerId, payeeId, amount });

describe("createSettlementBodySchema", () => {
  it.each([1, 20_000, 100_000_000])("#148: accepts the whole VND amount %i", (amount) => {
    expect(createSettlementBodySchema.safeParse(body(amount)).success).toBe(true);
  });

  it.each([0, -5, 1.5, 100_000_001])("#148 AC 6: rejects the amount %s", (amount) => {
    expect(createSettlementBodySchema.safeParse(body(amount)).success).toBe(false);
  });

  it("#148 AC 7: rejects a payer who is also the payee", () => {
    expect(createSettlementBodySchema.safeParse(body(20_000, payer, payer)).success).toBe(false);
  });

  it("#148: rejects ids that are not uuids", () => {
    expect(createSettlementBodySchema.safeParse(body(20_000, "x", payee)).success).toBe(false);
  });
});

describe("settlementResponseSchema", () => {
  it("#148: parses a stored settlement", () => {
    const stored = {
      id: "5d1c2b3a-4f5e-4a6b-8c7d-9e0f1a2b3c4d",
      groupId: "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d",
      ...body(20_000),
      createdAt: "2026-11-02T10:00:00.000Z",
    };
    expect(settlementResponseSchema.parse(stored)).toEqual(stored);
  });
});
