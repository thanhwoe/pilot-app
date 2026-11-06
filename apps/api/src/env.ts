import { z } from "zod";
import { resendEnvSchema } from "./auth/code-sender";
import { devCodesEnvSchema } from "./auth/dev-codes";
import { databaseEnvSchema } from "./db/database-env";

const envSchema = databaseEnvSchema
  .extend(devCodesEnvSchema.shape)
  .extend(resendEnvSchema.shape)
  .extend({
    PORT: z.coerce.number().int().positive().default(3001),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((value) => value.split(",").map((origin) => origin.trim())),
    /** Key for hashing sign-in codes and session tokens. Changing it signs everyone out. */
    AUTH_SECRET: z.string().min(32),
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
