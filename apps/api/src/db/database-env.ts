import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (CI, cloud sessions).
}

/** The part of the env that the database tools need: the server, drizzle-kit and the tests. */
export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
});
