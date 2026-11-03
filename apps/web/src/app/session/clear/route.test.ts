import { beforeEach, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { GET } from "./route";

const cookieStore = { delete: vi.fn() };

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it("[security] #31 A5: deletes the cookie and goes to /sign-in, whatever the query", async () => {
  const withQuery = new Request("http://web.test/session/clear?next=https://example.com");

  await expect((GET as unknown as (request: Request) => Promise<never>)(withQuery)).rejects.toThrow(
    "redirect:/sign-in",
  );

  expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
});
