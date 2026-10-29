import { z } from "zod";

/** Response of `GET /health`. The web and mobile apps parse it with this schema. */
export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["up", "down"]),
  /** `version` from `apps/api/package.json`, so you can tell which build is running. */
  version: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
