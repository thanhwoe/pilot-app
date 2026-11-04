import { expect, test } from "@playwright/test";
import {
  apiPost,
  devCode,
  goToCodeStep,
  hasDevCode,
  holdFirstServerAction,
  sessionCookie,
  uniqueEmail,
} from "./helpers";

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

test("#55 AC 1: an email edited while a failing send-code request is pending is not overwritten", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  await page.goto("/sign-in");
  const { held, release } = await holdFirstServerAction(page, "/sign-in");

  // An invalid email fails inside the action, without the API, so the failure is easy to force.
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Gửi mã" }).click();
  await held;
  await page.getByLabel("Email").fill(email);
  release();

  await expect(page.locator("main").getByRole("alert")).toHaveText("Email không hợp lệ.");
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByRole("button", { name: "Gửi mã" }).click();
  await expect(page.getByText(`Nhập mã 6 số đã gửi tới ${email}`)).toBeVisible();
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
  const email = uniqueEmail(testInfo);
  await goToCodeStep(page, email);

  await page.getByRole("button", { name: "Dùng email khác" }).click();

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
  await expect(page.getByLabel("Mã")).toHaveCount(0);
});

test("[security] AC 17: a code that isn't 6 digits shows an error and doesn't sign in", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  await goToCodeStep(page, email);
  const code = await devCode(email);

  await page.getByLabel("Mã").fill(code.slice(0, 5));
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.locator("main").getByRole("alert")).toHaveText("Mã gồm 6 chữ số.");
  expect(await sessionCookie(page)).toBeUndefined();
  // No sign-in was attempted, so the code still works through the API.
  expect((await apiPost("/auth/sign-in", { email, code })).status).toBe(200);
});

test("[security] AC 18: after 5 wrong codes even the right code is rejected", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  await goToCodeStep(page, email);
  const code = await devCode(email);
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    expect((await apiPost("/auth/sign-in", { email, code: wrong })).status).toBe(401);
  }

  await page.getByLabel("Mã").fill(code);
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Mã không đúng hoặc đã hết hạn. Hãy thử lại hoặc yêu cầu mã mới.",
  );
  await expect(page).toHaveURL("/sign-in");
  expect(await sessionCookie(page)).toBeUndefined();
});
