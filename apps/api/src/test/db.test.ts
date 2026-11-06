import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createTestDb, type TestDb } from "./db";

// Every table `schema.ts` defines. Taken from the schema, not written out, so a new table with its
// migration needs no edit here, and a table without a migration still fails (#95).
const schemaTables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => getTableName(table))
  .sort();

describe("createTestDb", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it("applies the migrations to a fresh database, with every table the schema defines", async () => {
    const rows = await testDb.database.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );

    expect(rows.map((row) => row.table_name)).toEqual(schemaTables);
  });
});
