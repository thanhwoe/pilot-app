import { readFileSync } from "node:fs";
import { healthResponseSchema } from "@gop/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app";
import { createMemoryAuthStore } from "./auth/memory-store";
import { createMemoryGroupStore } from "./groups/memory-store";
import { apiVersion } from "./version";

const authDeps = {
  authStore: createMemoryAuthStore(),
  groupStore: createMemoryGroupStore(),
  authSecret: "test-secret-that-is-at-least-32-characters",
  sendSignInCode: async () => {},
};

const packageVersion: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const app = buildApp({
      pingDb: async () => true,
      corsOrigins: [],
      ...authDeps,
      version: "1.2.3",
    });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json())).toEqual({
      status: "ok",
      db: "up",
      version: "1.2.3",
    });
  });

  it("reports degraded when the database is down", async () => {
    const app = buildApp({
      pingDb: async () => false,
      corsOrigins: [],
      ...authDeps,
      version: "1.2.3",
    });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "degraded", db: "down", version: "1.2.3" });
  });

  it("reports the version from apps/api/package.json", async () => {
    const app = buildApp({
      pingDb: async () => true,
      corsOrigins: [],
      ...authDeps,
      version: apiVersion,
    });

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(healthResponseSchema.parse(res.json()).version).toBe(packageVersion);
  });
});
