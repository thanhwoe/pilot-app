import { describe, expect, it, vi } from "vitest";
import { signInCopy } from "../sign-in/copy";
import type { GroupsApi } from "./api";
import { groupsCopy } from "./copy";
import {
  acceptInvite,
  isCreateSignedOut,
  isListSignedOut,
  loadGroups,
  makeInviteLink,
  openInvite,
  submitGroup,
} from "./flow";

const group = {
  id: "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d",
  name: "Đà Lạt",
  memberCount: 1,
  createdAt: "2026-11-02T10:00:00.000Z",
};

const listItem = { ...group, hasInvite: false };
const inviteToken = "C".repeat(43);

function fakeApi(overrides: Partial<GroupsApi> = {}): GroupsApi {
  return {
    listGroups: vi.fn(async () => ({ ok: true as const, data: { groups: [listItem] } })),
    createGroup: vi.fn(async () => ({ ok: true as const, data: group })),
    createInvite: vi.fn(async () => ({ ok: true as const, data: { token: inviteToken } })),
    previewInvite: vi.fn(async () => ({
      ok: true as const,
      data: { groupName: "Đà Lạt", alreadyMember: false },
    })),
    joinWithInvite: vi.fn(async () => ({ ok: true as const, data: group })),
    ...overrides,
  };
}

describe("loadGroups", () => {
  it("returns my groups", async () => {
    const api = fakeApi();

    expect(await loadGroups(api, "t0ken")).toEqual({ kind: "loaded", groups: [listItem] });
    expect(api.listGroups).toHaveBeenCalledWith("t0ken");
  });

  it("reads unavailable as the connection error (#14 AC 17, 22; #19 AC 5)", async () => {
    const api = fakeApi({
      listGroups: vi.fn(async () => ({ ok: false as const, error: "unavailable" as const })),
    });

    expect(await loadGroups(api, "t0ken")).toEqual({ kind: "unavailable" });
  });

  it("[security] #19 AC 2, 4: reads unauthorized as signed out", async () => {
    const api = fakeApi({
      listGroups: vi.fn(async () => ({ ok: false as const, error: "unauthorized" as const })),
    });

    expect(await loadGroups(api, "t0ken")).toEqual({ kind: "signed-out" });
  });
});

describe("submitGroup", () => {
  it("sends the trimmed name and returns the new group", async () => {
    const api = fakeApi();

    expect(await submitGroup(api, "t0ken", { name: "  Đà Lạt " })).toEqual({
      created: true,
      group,
    });
    expect(api.createGroup).toHaveBeenCalledWith("t0ken", { name: "Đà Lạt" });
  });

  it.each(["", "   "])("asks for a name and calls nothing for %j (AC 16, 21)", async (name) => {
    const api = fakeApi();

    expect(await submitGroup(api, "t0ken", { name })).toEqual({
      created: false,
      error: "Hãy nhập tên nhóm.",
    });
    expect(api.createGroup).not.toHaveBeenCalled();
  });

  it("shows the connection error when the API can't be reached (#14 AC 17, 22; #19 AC 5)", async () => {
    const api = fakeApi({
      createGroup: vi.fn(async () => ({ ok: false as const, error: "unavailable" as const })),
    });

    expect(await submitGroup(api, "t0ken", { name: "Nhà" })).toEqual({
      created: false,
      error: "Không kết nối được máy chủ. Hãy thử lại.",
    });
  });

  it("[security] #19 AC 1, 3: reads unauthorized as signed out", async () => {
    const api = fakeApi({
      createGroup: vi.fn(async () => ({ ok: false as const, error: "unauthorized" as const })),
    });

    expect(await submitGroup(api, "t0ken", { name: "Nhà" })).toEqual({
      created: false,
      signedOut: true,
    });
  });

  it("asks for a name when the API rejects the request as invalid (#19 AC 6)", async () => {
    const api = fakeApi({
      createGroup: vi.fn(async () => ({ ok: false as const, error: "invalid_request" as const })),
    });

    expect(await submitGroup(api, "t0ken", { name: "Nhà" })).toEqual({
      created: false,
      error: "Hãy nhập tên nhóm.",
    });
  });
});

describe("groupsCopy", () => {
  it("has the spec's strings", () => {
    expect(groupsCopy).toMatchObject({
      heading: "Nhóm của tôi",
      empty: "Bạn chưa có nhóm nào.",
      nameLabel: "Tên nhóm",
      create: "Tạo nhóm",
      nameRequired: "Hãy nhập tên nhóm.",
      unavailable: signInCopy.unavailable,
    });
    expect(groupsCopy.memberCount(1)).toBe("1 thành viên");
    expect(groupsCopy.memberCount(12)).toBe("12 thành viên");
  });
});

describe("isListSignedOut", () => {
  it("is true only for the signed-out list state", () => {
    expect(isListSignedOut({ kind: "signed-out" })).toBe(true);
    expect(isListSignedOut({ kind: "unavailable" })).toBe(false);
    expect(isListSignedOut({ kind: "loaded", groups: [listItem] })).toBe(false);
  });
});

describe("isCreateSignedOut", () => {
  it("is true only for the signed-out create outcome", () => {
    expect(isCreateSignedOut({ created: false, signedOut: true })).toBe(true);
    expect(isCreateSignedOut({ created: false, error: signInCopy.unavailable })).toBe(false);
    expect(isCreateSignedOut({ created: true, group })).toBe(false);
  });
});

const failing = (
  error: "unavailable" | "unauthorized" | "not_found" | "invalid_request" | "too_many_requests",
) => vi.fn(async () => ({ ok: false as const, error }));

describe("makeInviteLink", () => {
  it("#94 AC 1: returns the new token for a group", async () => {
    const api = fakeApi();

    expect(await makeInviteLink(api, "t0ken", group.id)).toEqual({
      made: true,
      token: inviteToken,
    });
    expect(api.createInvite).toHaveBeenCalledWith("t0ken", group.id);
  });

  it("[security] #94 A6: reads unauthorized as signed out", async () => {
    const api = fakeApi({ createInvite: failing("unauthorized") });

    expect(await makeInviteLink(api, "t0ken", group.id)).toEqual({ made: false, signedOut: true });
  });

  it.each(["unavailable", "not_found", "too_many_requests", "invalid_request"] as const)(
    "[security] #94 A6: keeps the session and shows the connection error for %s",
    async (error) => {
      const api = fakeApi({ createInvite: failing(error) });

      expect(await makeInviteLink(api, "t0ken", group.id)).toEqual({
        made: false,
        error: groupsCopy.unavailable,
      });
    },
  );
});

describe("openInvite", () => {
  it("#94 AC 2: returns the group's name and that I am not a member", async () => {
    const api = fakeApi();

    expect(await openInvite(api, "t0ken", inviteToken)).toEqual({
      kind: "invite",
      groupName: "Đà Lạt",
      alreadyMember: false,
    });
    expect(api.previewInvite).toHaveBeenCalledWith("t0ken", inviteToken);
  });

  it("#94 AC 3: returns that I am already a member", async () => {
    const api = fakeApi({
      previewInvite: vi.fn(async () => ({
        ok: true as const,
        data: { groupName: "Đà Lạt", alreadyMember: true },
      })),
    });

    expect(await openInvite(api, "t0ken", inviteToken)).toMatchObject({ alreadyMember: true });
  });

  it("[security] #94 AC 5: a 404 is a bad link, and so is a token of the wrong shape, without calling the API", async () => {
    const api = fakeApi({ previewInvite: failing("not_found") });

    expect(await openInvite(api, "t0ken", inviteToken)).toEqual({ kind: "bad-link" });
    expect(await openInvite(fakeApi(), "t0ken", "not-a-token")).toEqual({ kind: "bad-link" });
    const untouched = fakeApi();
    await openInvite(untouched, "t0ken", "not-a-token");
    expect(untouched.previewInvite).not.toHaveBeenCalled();
  });

  it("[security] #94 A6: reads unauthorized as signed out", async () => {
    const api = fakeApi({ previewInvite: failing("unauthorized") });

    expect(await openInvite(api, "t0ken", inviteToken)).toEqual({ kind: "signed-out" });
  });

  it.each(["unavailable", "too_many_requests", "invalid_request"] as const)(
    "[security] #94 A6: keeps the session and shows the connection error for %s",
    async (error) => {
      const api = fakeApi({ previewInvite: failing(error) });

      expect(await openInvite(api, "t0ken", inviteToken)).toEqual({ kind: "unavailable" });
    },
  );
});

describe("acceptInvite", () => {
  it("#94 AC 2: joins and returns the group", async () => {
    const api = fakeApi();

    expect(await acceptInvite(api, "t0ken", inviteToken)).toEqual({ kind: "joined", group });
    expect(api.joinWithInvite).toHaveBeenCalledWith("t0ken", inviteToken);
  });

  it("[security] #94 AC 5: a 404 is a bad link, and a token of the wrong shape joins nothing and calls nothing", async () => {
    const api = fakeApi({ joinWithInvite: failing("not_found") });

    expect(await acceptInvite(api, "t0ken", inviteToken)).toEqual({ kind: "bad-link" });
    const untouched = fakeApi();
    expect(await acceptInvite(untouched, "t0ken", "x")).toEqual({ kind: "bad-link" });
    expect(untouched.joinWithInvite).not.toHaveBeenCalled();
  });

  it("[security] #94 A6: reads unauthorized as signed out", async () => {
    const api = fakeApi({ joinWithInvite: failing("unauthorized") });

    expect(await acceptInvite(api, "t0ken", inviteToken)).toEqual({ kind: "signed-out" });
  });

  it("[security] #94 A6: keeps the session for any other failure", async () => {
    const api = fakeApi({ joinWithInvite: failing("unavailable") });

    expect(await acceptInvite(api, "t0ken", inviteToken)).toEqual({ kind: "unavailable" });
  });
});
