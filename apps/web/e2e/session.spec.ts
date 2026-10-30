import { expect, test } from "@playwright/test";
import { SESSION_COOKIE } from "../src/lib/session-cookie";
import { sessionCookie, signIn, uniqueEmail } from "./helpers";
import { API_URL, WEB_URL } from "./servers";

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

test("[security] AC 16: a cookie the API rejects sends me to sign-in and is removed", async ({
  page,
}) => {
  await page
    .context()
    .addCookies([{ name: SESSION_COOKIE, value: "made-up-token", url: WEB_URL, httpOnly: true }]);

  await page.goto("/");

  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
  expect(await sessionCookie(page)).toBeUndefined();
});

test("[security] AC 16: clearing the session always redirects to /sign-in, whatever the query", async ({
  request,
}) => {
  const res = await request.get(
    "/session/clear?next=https://evil.example/&redirect=//evil.example/&returnTo=/elsewhere",
    { maxRedirects: 0 },
  );

  expect(res.status()).toBe(307);
  expect(new URL(res.headers().location, WEB_URL).toString()).toBe(`${WEB_URL}/sign-in`);
  expect(res.headers()["set-cookie"]).toContain(`${SESSION_COOKIE}=;`);
});

test("the proxy never redirects a non-GET request, so Server Actions on /sign-in still run", async ({
  request,
}) => {
  const headers = { cookie: `${SESSION_COOKIE}=made-up-token` };

  // Contrast: the same cookie on a GET is read, and sends the visitor home.
  const get = await request.get("/sign-in", { headers, maxRedirects: 0 });
  expect(get.status()).toBe(307);
  expect(new URL(get.headers().location, WEB_URL).toString()).toBe(`${WEB_URL}/`);

  const post = await request.post("/sign-in", { headers, maxRedirects: 0 });
  // No redirect of any kind: the page itself answers (405 here, as the POST has no action id).
  expect(post.headers().location).toBeUndefined();
  expect(Math.floor(post.status() / 100)).not.toBe(3);
});

test("the proxy sends a signed-out HEAD request for / to sign-in, like a GET", async ({
  request,
}) => {
  const head = await request.head("/", { maxRedirects: 0 });

  expect(head.status()).toBe(307);
  expect(new URL(head.headers().location, WEB_URL).toString()).toBe(`${WEB_URL}/sign-in`);
});

test("[security] AC 16: an empty session cookie sends me to sign-in and is removed", async ({
  page,
}) => {
  await page.context().addCookies([{ name: SESSION_COOKIE, value: "", url: WEB_URL }]);

  await page.goto("/");

  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
  expect(await sessionCookie(page)).toBeUndefined();
});
