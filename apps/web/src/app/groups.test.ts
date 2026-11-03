import type { ApiResult, GroupListResponse } from "@gop/shared";
import { groupsCopy } from "@gop/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Groups } from "./groups";

const cookieStore = { get: vi.fn(), delete: vi.fn() };
const listGroups = vi.fn<(token: string) => Promise<ApiResult<GroupListResponse>>>();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/api", () => ({
  authApi: vi.fn(),
  groupsApi: () => ({ listGroups, createGroup: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: "t0ken" });
});

describe("Groups", () => {
  it("[security] #31 AC 4: a 401 on the list sends me to the route that clears the cookie", async () => {
    listGroups.mockResolvedValue({ ok: false, error: "unauthorized" });

    await expect(Groups()).rejects.toThrow("redirect:/session/clear");
  });

  it.each([
    ["unavailable", "unavailable"],
    ["not_found", "not_found"],
    ["too_many_requests", "too_many_requests"],
  ] as const)(
    "[security] #31 AC 2, 5: %s shows the connection error and keeps the cookie",
    async (_, error) => {
      listGroups.mockResolvedValue({ ok: false, error });

      const section = await Groups();

      expect(JSON.stringify(section)).toContain(groupsCopy.unavailable);
      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );
});
