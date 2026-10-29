import cors from "@fastify/cors";
import type { HealthResponse } from "@gop/shared";
import Fastify, { type FastifyServerOptions } from "fastify";
import { type AuthDeps, registerAuthRoutes } from "./auth/routes";

export interface AppDeps extends Omit<AuthDeps, "now"> {
  /** Resolves to true when the database is reachable. */
  pingDb: () => Promise<boolean>;
  corsOrigins: string[];
  /** Reported by `GET /health`. */
  version: string;
  /** `true` for the default logger, or Fastify logger options (tests pass a stream). */
  logger?: FastifyServerOptions["logger"];
  /** The clock. Tests pass their own to move time. */
  now?: () => Date;
}

/** Builds the Fastify app without listening, so tests can call it with `app.inject`. */
export function buildApp({
  pingDb,
  corsOrigins,
  version,
  logger = false,
  now = () => new Date(),
  ...auth
}: AppDeps) {
  const app = Fastify({ logger });

  app.register(cors, { origin: corsOrigins });

  app.get("/health", async (): Promise<HealthResponse> => {
    const dbUp = await pingDb();
    return { status: dbUp ? "ok" : "degraded", db: dbUp ? "up" : "down", version };
  });

  registerAuthRoutes(app, { ...auth, now });

  return app;
}
