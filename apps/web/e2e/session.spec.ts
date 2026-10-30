import { expect, test } from "@playwright/test";
import { sessionCookie, signIn, uniqueEmail } from "./helpers";
import { API_URL } from "./servers";

const thirtyDaysInSeconds = 30 * 24 * 60 * 60;

test("[security] AC 14: the session cookie is httpOnly, SameSite=Lax and Secure in production", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));

  // The E2E web server is `next start`, so NODE_ENV is production.
  expect(await sessionCookie(page)).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
  });
});

test("[security] AC 15: the session cookie expires 30 days after sign-in", async ({
  page,
}, testInfo) => {
  const signedInAt = Date.now() / 1000;
  await signIn(page, uniqueEmail(testInfo));

  const cookie = await sessionCookie(page);
  expect(cookie?.expires).toBeGreaterThan(signedInAt + thirtyDaysInSeconds - 60);
  expect(cookie?.expires).toBeLessThan(Date.now() / 1000 + thirtyDaysInSeconds + 60);
});

test("AC 10: signed in, the sign-in page sends me home", async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));

  await page.goto("/sign-in");

  await expect(page).toHaveURL("/");
});

test("AC 11: signing out ends the session on the server and returns me to sign-in", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  const token = (await sessionCookie(page))?.value;
  expect(token).toBeTruthy();

  await page.getByRole("button", { name: "Đăng xuất" }).click();

  await expect(page).toHaveURL("/sign-in");
  const me = await fetch(`${API_URL}/me`, { headers: { authorization: `Bearer ${token}` } });
  expect(me.status).toBe(401);
});

test("AC 12: after signing out, the home page sends me to sign-in", async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL("/sign-in");

  await page.goto("/");

  await expect(page).toHaveURL("/sign-in");
  expect(await sessionCookie(page)).toBeUndefined();
});
