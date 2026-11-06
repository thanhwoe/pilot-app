import { z } from "zod";

/**
 * One member's balance in whole VND: what they paid minus what they owe over the group's
 * expenses. Positive means the group owes them; negative means they owe the group.
 */
export const memberBalanceSchema = z.object({
  userId: z.uuid(),
  balance: z.int(),
});

export type MemberBalance = z.infer<typeof memberBalanceSchema>;

/** A payment that helps settle the group: `from` owes the group, `to` is owed. Whole VND, at least 1. */
export const suggestedPaymentSchema = z.object({
  from: z.uuid(),
  to: z.uuid(),
  amount: z.int().positive(),
});

export type SuggestedPayment = z.infer<typeof suggestedPaymentSchema>;

/**
 * Response of `GET /groups/:id/balances`: every current member's balance, including those at 0,
 * ordered by `userId`; and the payments that bring every balance to 0 (empty when they all are).
 */
export const balancesResponseSchema = z.object({
  balances: z.array(memberBalanceSchema),
  suggestions: z.array(suggestedPaymentSchema),
});

export type BalancesResponse = z.infer<typeof balancesResponseSchema>;
