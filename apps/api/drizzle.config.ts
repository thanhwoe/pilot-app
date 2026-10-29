import { defineConfig } from "drizzle-kit";
import { databaseEnvSchema } from "./src/db/database-env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseEnvSchema.parse(process.env).DATABASE_URL },
});
