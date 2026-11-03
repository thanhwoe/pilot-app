import type { ApiResult, MeResponse } from "@gop/shared";
import { signInCopy } from "@gop/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Account } from "./account";

const cookieStore = { get: vi.fn(), delete: vi.fn() };
const me = vi.fn<(token: string) => Promise<ApiResult<MeResponse>>>();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/api", () => ({
  authApi: () => ({ me }),
  groupsApi: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: "t0ken" });
});

describe("Account", () => {
  it("[security] #31 AC 4: a 401 on the account check sends me to the route that clears the cookie", async () => {
    me.mockResolvedValue({ ok: false, error: "unauthorized" });

    await expect(Account()).rejects.toThrow("redirect:/session/clear");
  });

  it("[security] #31 AC 2, 5: an unreachable API shows the connection error and keeps the cookie", async () => {
    me.mockResolvedValue({ ok: false, error: "unavailable" });

    const account = await Account();

    expect(JSON.stringify(account)).toContain(signInCopy.unavailable);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});
