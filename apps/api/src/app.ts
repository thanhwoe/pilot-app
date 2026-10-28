import cors from "@fastify/cors";
import type { HealthResponse } from "@gop/shared";
import Fastify from "fastify";

export interface AppDeps {
  /** Resolves to true when the database is reachable. */
  pingDb: () => Promise<boolean>;
  corsOrigins: string[];
  logger?: boolean;
}

/** Builds the Fastify app without listening, so tests can call it with `app.inject`. */
export function buildApp({ pingDb, corsOrigins, logger = false }: AppDeps) {
  const app = Fastify({ logger });

  app.register(cors, { origin: corsOrigins });

  app.get("/health", async (): Promise<HealthResponse> => {
    const dbUp = await pingDb();
    return { status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down" };
  });

  return app;
}
