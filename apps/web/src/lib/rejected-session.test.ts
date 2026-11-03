import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  endRejectedSessionInAction,
  redirectRejectedSessionFromComponent,
} from "./rejected-session";
import { SESSION_COOKIE } from "./session-cookie";

const cookieStore = { get: vi.fn(), delete: vi.fn() };

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
// The real redirect throws, so nothing after it runs; the fake does the same.
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("endRejectedSessionInAction", () => {
  it("[security] #31 AC 3: deletes the session cookie and sends me to sign-in", async () => {
    await expect(endRejectedSessionInAction()).rejects.toThrow("redirect:/sign-in");

    expect(cookieStore.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});

describe("redirectRejectedSessionFromComponent", () => {
  it("[security] #31 AC 4: sends me to the route that clears the cookie, and touches no cookie", () => {
    expect(() => redirectRejectedSessionFromComponent()).toThrow("redirect:/session/clear");

    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});
