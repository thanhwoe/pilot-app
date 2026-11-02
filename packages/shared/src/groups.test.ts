import { describe, expect, it } from "vitest";
import { errorResponseSchema } from "./auth";
import {
  createGroupBodySchema,
  GROUP_NAME_MAX_LENGTH,
  groupListResponseSchema,
  groupNameSchema,
  groupResponseSchema,
} from "./groups";

const group = {
  id: "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d",
  name: "Đà Lạt",
  memberCount: 1,
  createdAt: "2026-11-02T10:00:00.000Z",
};

describe("groupNameSchema", () => {
  it("trims the name (AC 2)", () => {
    expect(groupNameSchema.parse("  Đà Lạt  ")).toBe("Đà Lạt");
  });

  it("rejects an empty name and a name of only spaces (AC 3)", () => {
    expect(groupNameSchema.safeParse("").success).toBe(false);
    expect(groupNameSchema.safeParse("   ").success).toBe(false);
  });

  it("accepts 100 characters and rejects 101 (AC 12)", () => {
    expect(GROUP_NAME_MAX_LENGTH).toBe(100);
    expect(groupNameSchema.safeParse("a".repeat(100)).success).toBe(true);
    expect(groupNameSchema.safeParse("a".repeat(101)).success).toBe(false);
  });

  it("measures the length after trimming", () => {
    expect(groupNameSchema.safeParse(` ${"a".repeat(100)} `).success).toBe(true);
  });

  it("accepts Vietnamese and emoji", () => {
    expect(groupNameSchema.parse("Nhà 🏠")).toBe("Nhà 🏠");
  });
});

describe("createGroupBodySchema", () => {
  it("rejects a missing or non-string name (AC 3)", () => {
    expect(createGroupBodySchema.safeParse({}).success).toBe(false);
    expect(createGroupBodySchema.safeParse({ name: 42 }).success).toBe(false);
  });

  it("parses a trimmed name", () => {
    expect(createGroupBodySchema.parse({ name: " Nhà " })).toEqual({ name: "Nhà" });
  });
});

describe("group responses", () => {
  it("parses a group with an ISO creation time", () => {
    expect(groupResponseSchema.parse(group)).toEqual(group);
  });

  it("rejects a member count below 1 and a creation time that is not ISO", () => {
    expect(groupResponseSchema.safeParse({ ...group, memberCount: 0 }).success).toBe(false);
    expect(groupResponseSchema.safeParse({ ...group, createdAt: "yesterday" }).success).toBe(false);
  });

  it("parses a list of groups, including an empty one", () => {
    expect(groupListResponseSchema.parse({ groups: [group] })).toEqual({ groups: [group] });
    expect(groupListResponseSchema.parse({ groups: [] })).toEqual({ groups: [] });
  });
});

describe("errorResponseSchema", () => {
  it("accepts not_found (AC 9, 10)", () => {
    expect(errorResponseSchema.parse({ error: "not_found" })).toEqual({ error: "not_found" });
  });
});
