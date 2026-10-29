import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("accepts a healthy response", () => {
    expect(healthResponseSchema.parse({ status: "ok", db: "up", version: "1.2.3" })).toEqual({
      status: "ok",
      db: "up",
      version: "1.2.3",
    });
  });

  it("rejects an unknown status", () => {
    expect(
      healthResponseSchema.safeParse({ status: "broken", db: "up", version: "1.2.3" }).success,
    ).toBe(false);
  });

  it("rejects a response without a version", () => {
    expect(healthResponseSchema.safeParse({ status: "ok", db: "up" }).success).toBe(false);
  });

  it("rejects an empty version", () => {
    expect(healthResponseSchema.safeParse({ status: "ok", db: "up", version: "" }).success).toBe(
      false,
    );
  });
});
