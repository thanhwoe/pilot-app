import { healthResponseSchema } from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const app = buildApp({ pingDb: async () => true, corsOrigins: [] });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json())).toEqual({ status: "ok", db: "up" });
  });

  it("reports degraded when the database is down", async () => {
    const app = buildApp({ pingDb: async () => false, corsOrigins: [] });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "degraded", db: "down" });
  });
});
