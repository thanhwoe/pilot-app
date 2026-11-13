import { describe, expect, it } from "vitest";
import { errorResponseSchema } from "./auth";
import {
  createGroupBodySchema,
  createInviteResponseSchema,
  GROUP_NAME_MAX_LENGTH,
  groupDetailResponseSchema,
  groupListItemSchema,
  groupListResponseSchema,
  groupMemberSchema,
  groupNameSchema,
  groupResponseSchema,
  invitePreviewResponseSchema,
  inviteTokenBodySchema,
  inviteTokenSchema,
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
    const item = { ...group, hasInvite: false };

    expect(groupListResponseSchema.parse({ groups: [item] })).toEqual({ groups: [item] });
    expect(groupListResponseSchema.parse({ groups: [] })).toEqual({ groups: [] });
  });

  it("#94 AC 1: a list item says whether the group has an invite link, and needs it", () => {
    expect(groupListItemSchema.parse({ ...group, hasInvite: true }).hasInvite).toBe(true);
    expect(groupListItemSchema.safeParse(group).success).toBe(false);
    expect(groupListItemSchema.safeParse({ ...group, hasInvite: "yes" }).success).toBe(false);
    expect(groupListResponseSchema.safeParse({ groups: [group] }).success).toBe(false);
  });

  it("#94: the group a create, a get and a join answer with has no hasInvite", () => {
    expect(groupResponseSchema.parse({ ...group, hasInvite: true })).toEqual(group);
  });
});

describe("invite schemas", () => {
  const token = "A".repeat(43);

  it("#94 AC 5: accepts a token of 43 characters of letters, digits, - and _", () => {
    expect(inviteTokenSchema.safeParse(token).success).toBe(true);
    expect(inviteTokenSchema.safeParse("aB3-_".repeat(8) + "xyz").success).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["42 characters", "A".repeat(42)],
    ["44 characters", "A".repeat(44)],
    ["with a +", `${"A".repeat(42)}+`],
    ["with a /", `${"A".repeat(42)}/`],
    ["with a =", `${"A".repeat(42)}=`],
    ["with a space", `${"A".repeat(42)} `],
    ["with a newline", `${"A".repeat(42)}\n`],
  ])("#94 AC 5: rejects a token that is %s", (_case, value) => {
    expect(inviteTokenSchema.safeParse(value).success).toBe(false);
  });

  it("#94 AC 1: parses the answer to a new link, and rejects a bad token in it", () => {
    expect(createInviteResponseSchema.parse({ token })).toEqual({ token });
    expect(createInviteResponseSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(createInviteResponseSchema.safeParse({}).success).toBe(false);
  });

  it("#94 AC 5: the body of a preview or a join takes any string as the token, so a wrong one gets the same answer as a made-up one", () => {
    expect(inviteTokenBodySchema.parse({ token: "anything" })).toEqual({ token: "anything" });
    expect(inviteTokenBodySchema.parse({ token: "" })).toEqual({ token: "" });
    expect(inviteTokenBodySchema.safeParse({}).success).toBe(false);
    expect(inviteTokenBodySchema.safeParse({ token: 42 }).success).toBe(false);
  });

  it("#94 AC 2, 3: parses the preview of an invite", () => {
    const preview = { groupName: "Đà Lạt", alreadyMember: false };

    expect(invitePreviewResponseSchema.parse(preview)).toEqual(preview);
    expect(invitePreviewResponseSchema.safeParse({ groupName: "Đà Lạt" }).success).toBe(false);
  });
});

describe("errorResponseSchema", () => {
  it("accepts not_found (AC 9, 10)", () => {
    expect(errorResponseSchema.parse({ error: "not_found" })).toEqual({ error: "not_found" });
  });
});

describe("groupDetailResponseSchema", () => {
  const member = { userId: "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f", email: "an@example.com" };

  it("parses a group with its members", () => {
    const detail = { ...group, members: [member] };

    expect(groupDetailResponseSchema.parse(detail)).toEqual(detail);
  });

  it("rejects an empty member list, because a group always has its creator", () => {
    expect(groupDetailResponseSchema.safeParse({ ...group, members: [] }).success).toBe(false);
  });

  it("rejects a response with no members", () => {
    expect(groupDetailResponseSchema.safeParse(group).success).toBe(false);
  });

  it("rejects a member without an email", () => {
    expect(groupMemberSchema.safeParse({ userId: member.userId }).success).toBe(false);
  });

  it("rejects a member id that is not a uuid", () => {
    expect(groupMemberSchema.safeParse({ ...member, userId: "an" }).success).toBe(false);
  });
});
