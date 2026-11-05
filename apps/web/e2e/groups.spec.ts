import { expect, type Page, test } from "@playwright/test";
import { endSession, holdFirstServerAction, sessionCookie, signIn, uniqueEmail } from "./helpers";

function groupsList(page: Page) {
  return page.getByRole("list", { name: "Nhóm của tôi" });
}

async function createGroup(page: Page, name: string) {
  await page.getByLabel("Tên nhóm").fill(name);
  await page.getByRole("button", { name: "Tạo nhóm" }).click();
}

test("AC 14: with no groups, the home page shows the heading and the empty state", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));

  await expect(page.getByRole("heading", { name: "Nhóm của tôi" })).toBeVisible();
  await expect(page.getByText("Bạn chưa có nhóm nào.")).toBeVisible();
});

test("AC 15: creating a group shows it with 1 member and clears the field", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));

  await createGroup(page, "Đà Lạt");

  const items = groupsList(page).getByRole("listitem");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Đà Lạt");
  await expect(items.first()).toContainText("1 thành viên");
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("");
  await expect(page.getByText("Bạn chưa có nhóm nào.")).toBeHidden();
});

test("AC 13: my groups show their names and member counts, newest first", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Đà Lạt");
  await expect(groupsList(page).getByRole("listitem")).toHaveCount(1);
  await createGroup(page, "Nhà");
  await expect(groupsList(page).getByRole("listitem")).toHaveCount(2);

  await page.reload();

  const items = groupsList(page).getByRole("listitem");
  await expect(items).toHaveText([/^Nhà.*1 thành viên$/, /^Đà Lạt.*1 thành viên$/]);
});

test("AC 16: a name of only spaces shows the empty-name error and creates no group", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));

  await createGroup(page, "   ");

  await expect(page.locator("main").getByRole("alert")).toHaveText("Hãy nhập tên nhóm.");
  await expect(page.getByText("Bạn chưa có nhóm nào.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Bạn chưa có nhóm nào.")).toBeVisible();
});

test("#20 AC 2: a name of only spaces keeps what I typed in the field", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));

  await createGroup(page, "   ");

  await expect(page.locator("main").getByRole("alert")).toHaveText("Hãy nhập tên nhóm.");
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("   ");
  await expect(page.getByText("Bạn chưa có nhóm nào.")).toBeVisible();
});

test("#20 AC 3: a valid name after a failed create creates the group and clears the field", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "   ");
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("   ");

  await createGroup(page, "Đà Lạt");

  const items = groupsList(page).getByRole("listitem");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Đà Lạt");
  await expect(items.first()).toContainText("1 thành viên");
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("");
  await expect(page.locator("main").getByRole("alert")).toBeHidden();
});

test("#51 AC 1: text typed while a failed create is pending is not overwritten when it ends", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  // Hold only the first Server Action the form sends, so the test can type while it is pending.
  // That is what a slow CI run does to #20 AC 3: the next name is typed before the first create
  // has ended, and the form reset after the action must not put the old name back over it.
  const { held, release } = await holdFirstServerAction(page, "/");

  await createGroup(page, "   ");
  // Without a held request this test would pass for no reason: it times out here instead.
  await held;
  await page.getByLabel("Tên nhóm").fill("Đà Lạt");
  release();

  await expect(page.locator("main").getByRole("alert")).toHaveText("Hãy nhập tên nhóm.");
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("Đà Lạt");
  await page.getByRole("button", { name: "Tạo nhóm" }).click();
  const items = groupsList(page).getByRole("listitem");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Đà Lạt");
  await expect(items.first()).toContainText("1 thành viên");
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("");
  await expect(page.locator("main").getByRole("alert")).toBeHidden();
});

test("#54 AC 3, 4: text typed while a create is pending is kept when it succeeds, and a name left alone is cleared", async ({
  page,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  const { held, release } = await holdFirstServerAction(page, "/");

  await createGroup(page, "Đà Lạt");
  // Without a held request this test would pass for no reason: it times out here instead.
  await held;
  await page.getByLabel("Tên nhóm").fill("Nhà");
  release();

  const items = groupsList(page).getByRole("listitem");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Đà Lạt");
  // The list and the success state arrive together, and the form's effect runs just after the
  // commit. Wait for a frame, so "Nhà" is checked after the form has handled the success rather
  // than before it.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("Nhà");
  // The second create is not held, and nothing is typed while it runs: the field is cleared.
  await page.getByRole("button", { name: "Tạo nhóm" }).click();
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Nhà");
  await expect(page.getByLabel("Tên nhóm")).toHaveValue("");
});

test("createGroupAction without a session sends me to sign-in", async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await page.context().clearCookies();

  await createGroup(page, "Đà Lạt");

  await expect(page).toHaveURL("/sign-in");
});

test("[security] #19 AC 1: creating a group with a session the API ended sends me to sign-in", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  await signIn(page, email);
  const cookie = await sessionCookie(page);
  expect(cookie).toBeDefined();
  await endSession(cookie?.value ?? "");

  await createGroup(page, "Đà Lạt");

  await expect(page).toHaveURL("/sign-in");
  expect(await sessionCookie(page)).toBeUndefined();
  await signIn(page, email);
  await expect(page.getByText("Bạn chưa có nhóm nào.")).toBeVisible();
});
