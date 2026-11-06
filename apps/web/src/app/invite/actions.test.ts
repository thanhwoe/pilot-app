import type { ApiResult, CreateInviteResponse } from "@gop/shared";
import { groupsCopy } from "@gop/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { createInviteAction } from "./actions";

const cookieStore = { get: vi.fn(), delete: vi.fn() };
const createInvite =
  vi.fn<(token: string, groupId: string) => Promise<ApiResult<CreateInviteResponse>>>();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/api", () => ({
  authApi: vi.fn(),
  groupsApi: () => ({ listGroups: vi.fn(), createGroup: vi.fn(), createInvite }),
}));

const inviteToken = "D".repeat(43);
const groupId = "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d";

function form() {
  const data = new FormData();
  data.set("groupId", groupId);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: "t0ken" });
});

describe("createInviteAction", () => {
  it("#94 AC 1: asks the API for the group's link with the session token and returns the token", async () => {
    createInvite.mockResolvedValue({ ok: true, data: { token: inviteToken } });

    expect(await createInviteAction({}, form())).toStrictEqual({ token: inviteToken });

    expect(createInvite).toHaveBeenCalledWith("t0ken", groupId);
  });

  it("[security] #94 A6: a 401 from the API deletes the cookie and sends me to sign-in", async () => {
    createInvite.mockResolvedValue({ ok: false, error: "unauthorized" });

    await expect(createInviteAction({}, form())).rejects.toThrow("redirect:/sign-in");

    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("[security] #94 A6: without a session cookie it goes to sign-in and calls nothing", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(createInviteAction({}, form())).rejects.toThrow("redirect:/sign-in");

    expect(createInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["the API is unreachable", { ok: false, error: "unavailable" }],
    ["a 404", { ok: false, error: "not_found" }],
    ["a 429", { ok: false, error: "too_many_requests" }],
  ] as const)(
    "[security] #94 A6: %s keeps the session and shows the error",
    async (_name, result) => {
      createInvite.mockResolvedValue(result);

      expect(await createInviteAction({}, form())).toStrictEqual({ error: groupsCopy.unavailable });

      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );

  it("#94 AC 1: a form with no group id asks the API with an empty id, which it answers with a 404", async () => {
    createInvite.mockResolvedValue({ ok: false, error: "not_found" });

    expect(await createInviteAction({}, new FormData())).toStrictEqual({
      error: groupsCopy.unavailable,
    });
    expect(createInvite).toHaveBeenCalledWith("t0ken", "");
  });
});
