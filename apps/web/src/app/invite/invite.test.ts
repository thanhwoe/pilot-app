import type { ApiResult, InvitePreviewResponse } from "@gop/shared";
import { groupsCopy, invitesCopy } from "@gop/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Invite } from "./invite";

const cookieStore = { get: vi.fn(), delete: vi.fn() };
const previewInvite =
  vi.fn<(token: string, inviteToken: string) => Promise<ApiResult<InvitePreviewResponse>>>();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/api", () => ({
  authApi: vi.fn(),
  groupsApi: () => ({
    listGroups: vi.fn(),
    createGroup: vi.fn(),
    createInvite: vi.fn(),
    previewInvite,
    joinWithInvite: vi.fn(),
  }),
}));

const inviteToken = "E".repeat(43);

async function markup(token = inviteToken) {
  return renderToStaticMarkup(await Invite({ token }));
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue({ value: "t0ken" });
});

describe("Invite", () => {
  it("#94 AC 2: shows a non-member the group's name and a join button", async () => {
    previewInvite.mockResolvedValue({
      ok: true,
      data: { groupName: "Đà Lạt", alreadyMember: false },
    });

    const html = await markup();

    expect(previewInvite).toHaveBeenCalledWith("t0ken", inviteToken);
    expect(html).toContain(invitesCopy.heading("Đà Lạt"));
    expect(html).toContain(invitesCopy.join);
    expect(html).not.toContain(invitesCopy.badLink);
  });

  it("#94 AC 3: sends a member to the groups list", async () => {
    previewInvite.mockResolvedValue({
      ok: true,
      data: { groupName: "Đà Lạt", alreadyMember: true },
    });

    await expect(Invite({ token: inviteToken })).rejects.toThrow("redirect:/");
  });

  it("[security] #94 AC 5: a 404, and a token of the wrong shape, show the same markup with no join button", async () => {
    previewInvite.mockResolvedValue({ ok: false, error: "not_found" });

    const notFound = await markup();
    const malformed = await markup("short");

    expect(notFound).toContain(invitesCopy.badLink);
    expect(notFound).not.toContain(invitesCopy.join);
    expect(malformed).toBe(notFound);
    expect(previewInvite).toHaveBeenCalledTimes(1);
  });

  it("[security] #94 A6: a 401 sends me to the route that clears the cookie", async () => {
    previewInvite.mockResolvedValue({ ok: false, error: "unauthorized" });

    await expect(Invite({ token: inviteToken })).rejects.toThrow("redirect:/session/clear");
  });

  it.each([
    ["the API is unreachable", "unavailable"],
    ["a 429", "too_many_requests"],
  ] as const)(
    "[security] #94 A6: %s shows the connection error and keeps the cookie",
    async (_name, error) => {
      previewInvite.mockResolvedValue({ ok: false, error });

      const html = await markup();

      expect(html).toContain(groupsCopy.unavailable);
      expect(html).not.toContain(invitesCopy.join);
      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );

  it("goes to sign-in, calling nothing, when there is no session cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await expect(Invite({ token: inviteToken })).rejects.toThrow("redirect:/sign-in");

    expect(previewInvite).not.toHaveBeenCalled();
  });
});
