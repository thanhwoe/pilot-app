import { describe, expect, it, vi } from "vitest";
import { signInCopy } from "../sign-in/copy";
import type { GroupsApi } from "./api";
import { groupsCopy } from "./copy";
import {
  acceptInvite,
  isCreateSignedOut,
  isListSignedOut,
  isSaveExpenseSignedOut,
  isScreenSignedOut,
  loadGroupScreen,
  loadGroups,
  makeInviteLink,
  openInvite,
  submitExpense,
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

const me = "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f";
const bao = "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6e";
const members = [
  { userId: me, email: "an@example.com" },
  { userId: bao, email: "bao@example.com" },
];
const detail = { ...group, memberCount: 2, members };
const expense = {
  id: "3d9e0f1a-2b3c-4d5e-8f6a-7b8c9d0e1f2a",
  groupId: group.id,
  payerId: me,
  amount: 90000,
  description: "An toi",
  createdAt: "2026-11-13T10:00:00.000Z",
  shares: [
    { userId: bao, amount: 45000 },
    { userId: me, amount: 45000 },
  ],
};

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
    getGroup: vi.fn(async () => ({ ok: true as const, data: detail })),
    listExpenses: vi.fn(async () => ({ ok: true as const, data: { expenses: [expense] } })),
    createExpense: vi.fn(async () => ({ ok: true as const, data: expense })),
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

const failed = (error: "unauthorized" | "unavailable" | "not_found" | "invalid_request") =>
  vi.fn(async () => ({ ok: false as const, error }));

describe("loadGroupScreen", () => {
  it("#97 AC 1, 2: returns the group, its members and its expenses", async () => {
    const api = fakeApi();

    expect(await loadGroupScreen(api, "t0ken", group.id)).toEqual({
      kind: "loaded",
      group: detail,
      expenses: [expense],
    });
    expect(api.getGroup).toHaveBeenCalledWith("t0ken", group.id);
    expect(api.listExpenses).toHaveBeenCalledWith("t0ken", group.id);
  });

  it.each([
    ["the group", "getGroup"],
    ["the expenses", "listExpenses"],
  ] as const)(
    "[security] #97 AC 9: reads unauthorized on %s as signed out",
    async (_what, call) => {
      const api = fakeApi({ [call]: failed("unauthorized") });

      expect(await loadGroupScreen(api, "t0ken", group.id)).toEqual({ kind: "signed-out" });
    },
  );

  it.each([
    ["the group", "getGroup"],
    ["the expenses", "listExpenses"],
  ] as const)("#97 A9: reads any other failure on %s as unavailable", async (_what, call) => {
    for (const error of ["unavailable", "not_found", "invalid_request"] as const) {
      const api = fakeApi({ [call]: failed(error) });

      expect(await loadGroupScreen(api, "t0ken", group.id)).toEqual({ kind: "unavailable" });
    }
  });

  it("[security] #97 AC 9: signed out wins when one call fails and the other is rejected", async () => {
    const api = fakeApi({ getGroup: failed("unavailable"), listExpenses: failed("unauthorized") });

    expect(await loadGroupScreen(api, "t0ken", group.id)).toEqual({ kind: "signed-out" });
  });
});

describe("isScreenSignedOut", () => {
  it("is true only for the signed-out screen state", () => {
    expect(isScreenSignedOut({ kind: "signed-out" })).toBe(true);
    expect(isScreenSignedOut({ kind: "unavailable" })).toBe(false);
  });
});

describe("submitExpense", () => {
  const form = { groupId: group.id, myId: me, memberIds: [me, bao] };

  it("#97 AC 4: sends me as the payer, the integer amount, the trimmed description and every member", async () => {
    const api = fakeApi();

    expect(
      await submitExpense(api, "t0ken", { ...form, amount: 90000, description: "  An toi " }),
    ).toEqual({ saved: true, expense });
    expect(api.createExpense).toHaveBeenCalledWith("t0ken", group.id, {
      payerId: me,
      amount: 90000,
      description: "An toi",
      splitBetween: [me, bao],
    });
  });

  it.each([
    [0, "An toi", "Hãy nhập số tiền."],
    [100_000_001, "An toi", "Số tiền tối đa là 100.000.000 ₫."],
    [90000, "", "Hãy nhập mô tả."],
    [90000, "   ", "Hãy nhập mô tả."],
  ])(
    "#97 AC 6: refuses %j and %j with its own message and calls nothing",
    async (amount, description, error) => {
      const api = fakeApi();

      expect(await submitExpense(api, "t0ken", { ...form, amount, description })).toEqual({
        saved: false,
        error,
      });
      expect(api.createExpense).not.toHaveBeenCalled();
    },
  );

  it("#97 AC 6: accepts the largest amount", async () => {
    const api = fakeApi();

    const outcome = await submitExpense(api, "t0ken", {
      ...form,
      amount: 100_000_000,
      description: "Xe",
    });

    expect(outcome).toEqual({ saved: true, expense });
  });

  it("#97 A10: accepts 200 characters and refuses 201", async () => {
    const api = fakeApi();

    expect(
      await submitExpense(api, "t0ken", { ...form, amount: 1000, description: "a".repeat(200) }),
    ).toEqual({ saved: true, expense });
    expect(
      await submitExpense(api, "t0ken", { ...form, amount: 1000, description: "a".repeat(201) }),
    ).toEqual({ saved: false, error: "Không kết nối được máy chủ. Hãy thử lại." });
    expect(api.createExpense).toHaveBeenCalledTimes(1);
  });

  it("[security] #97 AC 9: reads unauthorized as signed out", async () => {
    const api = fakeApi({ createExpense: failed("unauthorized") });

    const outcome = await submitExpense(api, "t0ken", { ...form, amount: 1000, description: "x" });

    expect(outcome).toEqual({ saved: false, signedOut: true });
    expect(isSaveExpenseSignedOut(outcome)).toBe(true);
  });

  it.each(["invalid_request", "not_found", "unavailable"] as const)(
    "#97 AC 7: shows the connection error for %s",
    async (error) => {
      const api = fakeApi({ createExpense: failed(error) });

      const outcome = await submitExpense(api, "t0ken", {
        ...form,
        amount: 1000,
        description: "x",
      });

      expect(outcome).toEqual({
        saved: false,
        error: "Không kết nối được máy chủ. Hãy thử lại.",
      });
      expect(isSaveExpenseSignedOut(outcome)).toBe(false);
    },
  );
});
