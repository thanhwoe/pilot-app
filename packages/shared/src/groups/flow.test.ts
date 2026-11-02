import { describe, expect, it, vi } from "vitest";
import { signInCopy } from "../sign-in/copy";
import type { GroupsApi } from "./api";
import { groupsCopy } from "./copy";
import { loadGroups, submitGroup } from "./flow";

const group = {
  id: "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d",
  name: "Đà Lạt",
  memberCount: 1,
  createdAt: "2026-11-02T10:00:00.000Z",
};

function fakeApi(overrides: Partial<GroupsApi> = {}): GroupsApi {
  return {
    listGroups: vi.fn(async () => ({ ok: true as const, data: { groups: [group] } })),
    createGroup: vi.fn(async () => ({ ok: true as const, data: group })),
    ...overrides,
  };
}

describe("loadGroups", () => {
  it("returns my groups", async () => {
    const api = fakeApi();

    expect(await loadGroups(api, "t0ken")).toEqual({ kind: "loaded", groups: [group] });
    expect(api.listGroups).toHaveBeenCalledWith("t0ken");
  });

  it.each(["unavailable", "unauthorized"] as const)(
    "reads %s as unavailable (AC 17, 22)",
    async (error) => {
      const api = fakeApi({ listGroups: vi.fn(async () => ({ ok: false as const, error })) });

      expect(await loadGroups(api, "t0ken")).toEqual({ kind: "unavailable" });
    },
  );
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

  it("shows the connection error when the API can't be reached (AC 17, 22)", async () => {
    const api = fakeApi({
      createGroup: vi.fn(async () => ({ ok: false as const, error: "unavailable" as const })),
    });

    expect(await submitGroup(api, "t0ken", { name: "Nhà" })).toEqual({
      created: false,
      error: "Không kết nối được máy chủ. Hãy thử lại.",
    });
  });

  it("asks for a name when the API rejects the request as invalid", async () => {
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
