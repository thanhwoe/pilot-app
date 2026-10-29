import { z } from "zod";
import { databaseEnvSchema } from "./db/database-env";

const envSchema = databaseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
