import { z } from "zod";

/** Response of `GET /health`. The web and mobile apps parse it with this schema. */
export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["up", "down"]),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
