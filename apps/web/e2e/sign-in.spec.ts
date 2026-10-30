import { expect, type Page, test } from "@playwright/test";
import { SESSION_COOKIE } from "../src/lib/session-cookie";
import { apiPost, devCode, hasDevCode, uniqueEmail } from "./helpers";

test("AC 1: signed out, the home page sends me to sign-in, which asks for my email", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
});

test("AC 2: a valid email asks the API for a code and shows the code step", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi mã" }).click();

  await expect(page.getByText(`Nhập mã 6 số đã gửi tới ${email}`)).toBeVisible();
  await expect(page.getByLabel("Mã")).toBeVisible();
  expect(await hasDevCode(email)).toBe(true);
});

test("AC 6: an invalid email shows an error and requests no code", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Gửi mã" }).click();

  await expect(page.locator("main").getByRole("alert")).toHaveText("Email không hợp lệ.");
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
  await expect(page.getByLabel("Mã")).toHaveCount(0);
  expect(await hasDevCode("not-an-email")).toBe(false);
});

test("AC 7: a 6th code request in 15 minutes shows the too-many-requests error", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  for (let i = 0; i < 5; i++) {
    expect((await apiPost("/auth/code", { email })).status).toBe(204);
  }
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi mã" }).click();

  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Bạn đã yêu cầu quá nhiều mã. Hãy thử lại sau 15 phút.",
  );
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
});

async function goToCodeStep(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi mã" }).click();
  await expect(page.getByLabel("Mã")).toBeVisible();
}

async function sessionCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === SESSION_COOKIE);
}

test("AC 3, 9: the right code signs me in, and home shows my email", async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo);
  await goToCodeStep(page, email);

  await page.getByLabel("Mã").fill(await devCode(email));
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText(`Đã đăng nhập: ${email}`)).toBeVisible();
  expect(await sessionCookie(page)).toBeDefined();
});

test("AC 4: a wrong code keeps me signed out on the code step with an error", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  await goToCodeStep(page, email);
  const code = await devCode(email);
  const wrong = code === "000000" ? "111111" : "000000";

  await page.getByLabel("Mã").fill(wrong);
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Mã không đúng hoặc đã hết hạn. Hãy thử lại hoặc yêu cầu mã mới.",
  );
  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByLabel("Mã")).toBeVisible();
  expect(await sessionCookie(page)).toBeUndefined();
});

test("AC 5: 'use another email' goes back to the email step", async ({ page }, testInfo) => {
  await goToCodeStep(page, uniqueEmail(testInfo));

  await page.getByRole("button", { name: "Dùng email khác" }).click();

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
  await expect(page.getByLabel("Mã")).toHaveCount(0);
});
