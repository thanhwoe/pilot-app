import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });

  return {
    db,
    /** Resolves to true when Postgres answers a trivial query. */
    async ping(): Promise<boolean> {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
    close: () => client.end(),
  };
}

export type Database = ReturnType<typeof createDb>;
