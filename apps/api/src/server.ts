import { buildApp } from "./app";
import { devCodesFor } from "./auth/dev-codes";
import { logSignInCode } from "./auth/log-code-sender";
import { createPostgresAuthStore } from "./auth/store";
import { createDb } from "./db/client";
import { env } from "./env";
import { apiVersion } from "./version";

const database = createDb(env.DATABASE_URL);
const app = buildApp({
  pingDb: database.ping,
  corsOrigins: env.CORS_ORIGINS,
  version: apiVersion,
  logger: true,
  authStore: createPostgresAuthStore(database.db),
  authSecret: env.AUTH_SECRET,
  sendSignInCode: logSignInCode,
  devCodes: devCodesFor(env),
});

const shutdown = async () => {
  await app.close();
  await database.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 0.0.0.0 so the Android emulator (10.0.2.2) and devices on the LAN can reach it.
await app.listen({ port: env.PORT, host: "0.0.0.0" });
