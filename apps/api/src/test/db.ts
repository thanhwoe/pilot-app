import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb, type Database } from "../db/client";
import { databaseEnvSchema } from "../db/database-env";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export interface TestDb {
  database: Database;
  drop: () => Promise<void>;
}

/**
 * Creates a throwaway database with the migrations applied, so tests never touch dev data.
 * Call `drop` in `afterAll`.
 */
export async function createTestDb(): Promise<TestDb> {
  const { DATABASE_URL } = databaseEnvSchema.parse(process.env);
  const name = `gop_test_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });

  try {
    await admin`create database ${admin(name)}`;
  } catch (error) {
    await admin.end();
    throw new Error(`Cannot create a test database at DATABASE_URL. Is Postgres up (pnpm db:up)?`, {
      cause: error,
    });
  }

  const url = new URL(DATABASE_URL);
  url.pathname = `/${name}`;
  const database = createDb(url.toString());
  await migrate(database.db, { migrationsFolder });

  return {
    database,
    async drop() {
      await database.close();
      await admin`drop database ${admin(name)} with (force)`;
      await admin.end();
    },
  };
}
