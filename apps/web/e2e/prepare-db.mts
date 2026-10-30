// Creates the E2E database if it is missing. The API's db:migrate then brings it up to date.
import postgres from "postgres";

const target = new URL(process.argv[2] ?? "");
const name = target.pathname.slice(1);
const admin = new URL(target);
admin.pathname = "/postgres";

const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
try {
  const [found] = await sql`select 1 from pg_database where datname = ${name}`;
  if (!found) {
    await sql`create database ${sql(name)}`;
  }
} finally {
  await sql.end();
}
