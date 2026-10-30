import { expect, test } from "@playwright/test";
import { sessionCookie, signIn, uniqueEmail } from "./helpers";

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
