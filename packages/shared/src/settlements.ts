import { z } from "zod";
import { expenseAmountSchema } from "./expenses";

/**
 * Body of `POST /groups/:id/settlements`: one member paid another member back. The amount follows
 * the expense amount rule (a whole VND integer), and nobody pays themselves.
 */
export const createSettlementBodySchema = z
  .object({
    payerId: z.uuid(),
    payeeId: z.uuid(),
    amount: expenseAmountSchema,
  })
  .refine((body) => body.payerId !== body.payeeId);

export type CreateSettlementBody = z.infer<typeof createSettlementBodySchema>;

export const settlementSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  payerId: z.uuid(),
  payeeId: z.uuid(),
  amount: expenseAmountSchema,
  createdAt: z.iso.datetime(),
});

export type Settlement = z.infer<typeof settlementSchema>;

/** Response of `POST /groups/:id/settlements` (201). */
export const settlementResponseSchema = settlementSchema;

export type SettlementResponse = z.infer<typeof settlementResponseSchema>;
