import { expect, type Page, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";
import { WEB_URL } from "./servers";

const SHOWN_ONCE =
  "Liên kết này chỉ hiện một lần. Nếu cần lại, hãy tạo liên kết mới. Liên kết cũ sẽ không dùng được nữa.";

function groupsList(page: Page) {
  return page.getByRole("list", { name: "Nhóm của tôi" });
}

async function createGroup(page: Page, name: string) {
  await page.getByLabel("Tên nhóm").fill(name);
  await page.getByRole("button", { name: "Tạo nhóm" }).click();
  await expect(groupsList(page).getByRole("listitem").filter({ hasText: name })).toHaveCount(1);
}

/** The row of a group in the groups list. */
function row(page: Page, name: string) {
  return groupsList(page).getByRole("listitem").filter({ hasText: name });
}

test("#94 AC 1, 8: a member makes an invite link, sees that it is shown once, copies it, and a new link replaces it", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Đà Lạt");
  const group = row(page, "Đà Lạt");
  await expect(group.getByLabel("Liên kết mời")).toHaveCount(0);

  await group.getByRole("button", { name: "Mời thành viên" }).click();

  const link = group.getByLabel("Liên kết mời");
  await expect(link).toHaveValue(new RegExp(`^${WEB_URL}/invite/[A-Za-z0-9_-]{43}$`));
  await expect(link).toHaveJSProperty("readOnly", true);
  await expect(group.getByText(SHOWN_ONCE)).toBeVisible();

  await group.getByRole("button", { name: "Sao chép" }).click();

  await expect(group.getByRole("button", { name: "Đã sao chép" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await link.inputValue());

  // The button now says that pressing it ends the old link; the new link is a different one.
  const first = await link.inputValue();
  await expect(group.getByRole("button", { name: "Mời thành viên" })).toHaveCount(0);
  await group.getByRole("button", { name: "Tạo liên kết mới" }).click();
  await expect(link).not.toHaveValue(first);
  await expect(link).toHaveValue(new RegExp(`^${WEB_URL}/invite/[A-Za-z0-9_-]{43}$`));
  await expect(group.getByRole("button", { name: "Sao chép" })).toBeVisible();
});

test("#94 AC 8: the link is not shown again after a reload, and the button then reads 'Tạo liên kết mới'", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Nhà");
  await row(page, "Nhà").getByRole("button", { name: "Mời thành viên" }).click();
  await expect(row(page, "Nhà").getByLabel("Liên kết mời")).toBeVisible();

  await page.reload();

  await expect(row(page, "Nhà").getByLabel("Liên kết mời")).toHaveCount(0);
  await expect(row(page, "Nhà").getByText(SHOWN_ONCE)).toHaveCount(0);
  await expect(row(page, "Nhà").getByRole("button", { name: "Tạo liên kết mới" })).toBeVisible();
  await expect(row(page, "Nhà").getByRole("button", { name: "Mời thành viên" })).toHaveCount(0);
});

test("#94 AC 1: a group with no link keeps reading 'Mời thành viên' while another group has one", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Có liên kết");
  await createGroup(page, "Chưa có");
  await row(page, "Có liên kết").getByRole("button", { name: "Mời thành viên" }).click();
  await expect(row(page, "Có liên kết").getByLabel("Liên kết mời")).toBeVisible();

  await page.reload();

  await expect(
    row(page, "Có liên kết").getByRole("button", { name: "Tạo liên kết mới" }),
  ).toBeVisible();
  await expect(row(page, "Chưa có").getByRole("button", { name: "Mời thành viên" })).toBeVisible();
});
