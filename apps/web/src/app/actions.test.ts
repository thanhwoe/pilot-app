import type { ApiResult, GroupResponse } from "@gop/shared";
import { groupsCopy } from "@gop/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { createGroupAction } from "./actions";

const cookieStore = { get: vi.fn(), delete: vi.fn() };
const createGroup =
  vi.fn<(token: string, body: { name: string }) => Promise<ApiResult<GroupResponse>>>();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/api", () => ({
  authApi: vi.fn(),
  groupsApi: () => ({ listGroups: vi.fn(), createGroup }),
}));

function form(name: string) {
  const data = new FormData();
  data.set("name", name);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: "t0ken" });
});

describe("createGroupAction", () => {
  it("[security] #31 AC 3: a 401 from the API deletes the cookie and sends me to sign-in", async () => {
    createGroup.mockResolvedValue({ ok: false, error: "unauthorized" });

    await expect(createGroupAction({}, form("Đà Lạt"))).rejects.toThrow("redirect:/sign-in");

    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it.each([
    ["the API is unreachable", { ok: false, error: "unavailable" }, groupsCopy.unavailable],
    ["a timeout or a 5xx", { ok: false, error: "unavailable" }, groupsCopy.unavailable],
    ["a 404", { ok: false, error: "not_found" }, groupsCopy.unavailable],
    ["a 429", { ok: false, error: "too_many_requests" }, groupsCopy.unavailable],
    ["a 400", { ok: false, error: "invalid_request" }, groupsCopy.nameRequired],
  ] as const)(
    "[security] #31 AC 2, 5: %s keeps the session and shows the error",
    async (_, result, error) => {
      createGroup.mockResolvedValue(result);

      expect(await createGroupAction({}, form("Đà Lạt"))).toEqual({ error });

      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );
});
