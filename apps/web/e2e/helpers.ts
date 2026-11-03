import { randomBytes } from "node:crypto";
import { devSignInCodeResponseSchema } from "@gop/shared";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { SESSION_COOKIE } from "../src/lib/session-cookie";
import { API_URL } from "./servers";

/**
 * A fresh email for one test. The API limits codes and attempts per email, so tests that shared an
 * address would fail at random once they ran in parallel or in a retry. Call it once per test.
 */
export function uniqueEmail(testInfo: TestInfo): string {
  return `e2e-${testInfo.testId}-${randomBytes(4).toString("hex")}@example.test`;
}

function fetchDevCode(email: string): Promise<Response> {
  return fetch(`${API_URL}/dev/sign-in-code?email=${encodeURIComponent(email)}`);
}

/** The latest code the API sent to `email`, from the dev code endpoint. */
export async function devCode(email: string): Promise<string> {
  const res = await fetchDevCode(email);
  expect(res.status, `no code was sent to ${email}`).toBe(200);
  return devSignInCodeResponseSchema.parse(await res.json()).code;
}

/** Whether the API has sent any code to `email`. */
export async function hasDevCode(email: string): Promise<boolean> {
  return (await fetchDevCode(email)).status === 200;
}

/** Calls the API directly, bypassing the web, to set up a state such as a rate limit. */
export function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Ends a session on the API directly, as if it expired, while the browser keeps its cookie. */
export async function endSession(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/sign-out`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.ok, "the API didn't end the session").toBe(true);
}

/** Signs in through the page with a fresh code, and waits for the signed-in home. */
export async function signIn(page: Page, email: string): Promise<void> {
  await goToCodeStep(page, email);
  await page.getByLabel("Mã").fill(await devCode(email));
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL("/");
}

/** Opens sign-in and submits `email`, landing on the code step. */
export async function goToCodeStep(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi mã" }).click();
  await expect(page.getByLabel("Mã")).toBeVisible();
}

/** The session cookie as the browser holds it, or undefined. */
export async function sessionCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === SESSION_COOKIE);
}
