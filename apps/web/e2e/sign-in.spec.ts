import { expect, test } from "@playwright/test";

test("AC 1: signed out, the home page sends me to sign-in, which asks for my email", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi mã" })).toBeVisible();
});
