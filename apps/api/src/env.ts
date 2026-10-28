import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (CI, cloud sessions).
}

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
