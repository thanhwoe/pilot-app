import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("accepts a healthy response", () => {
    expect(healthResponseSchema.parse({ status: "ok", db: "up" })).toEqual({
      status: "ok",
      db: "up",
    });
  });

  it("rejects an unknown status", () => {
    expect(healthResponseSchema.safeParse({ status: "broken", db: "up" }).success).toBe(false);
  });
});
