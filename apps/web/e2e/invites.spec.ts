import { type Browser, expect, type Page, test } from "@playwright/test";
import { devCode, goToCodeStep, signIn, uniqueEmail } from "./helpers";
import { WEB_URL } from "./servers";

const BAD_LINK = "Liên kết mời này không dùng được. Hãy xin người mời bạn một liên kết mới.";
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

/**
 * Makes the group's invite link on the groups list and returns the link as shown. When a link is
 * already showing (the button reads "Tạo liên kết mới"), it waits for a different one: until the
 * action ends, the old link is still in the field.
 */
async function makeLink(page: Page, name: string): Promise<string> {
  const group = row(page, name);
  const link = group.getByLabel("Liên kết mời");
  const before = (await link.count()) > 0 ? await link.inputValue() : null;
  await group.getByRole("button", { name: /^(Mời thành viên|Tạo liên kết mới)$/ }).click();
  if (before === null) {
    await expect(link).toHaveValue(/\/invite\//);
  } else {
    await expect(link).not.toHaveValue(before);
  }
  return link.inputValue();
}

/** A second person, signed in on their own browser context. */
async function secondPerson(browser: Browser, email: string) {
  const context = await browser.newContext({ baseURL: WEB_URL });
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}

test("#94 AC 2: a signed-in non-member sees the group's name and a join button, and joining adds the group to their list", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Đà Lạt");
  const link = await makeLink(page, "Đà Lạt");
  const bao = await secondPerson(browser, `bao-${uniqueEmail(testInfo)}`);

  await bao.goto(link);

  await expect(bao.getByRole("heading", { name: "Bạn được mời vào nhóm “Đà Lạt”" })).toBeVisible();
  await expect(groupsList(bao)).toHaveCount(0);
  await bao.getByRole("button", { name: "Tham gia nhóm" }).click();

  await expect(bao).toHaveURL("/");
  await expect(row(bao, "Đà Lạt")).toContainText("2 thành viên");
  await page.reload();
  await expect(row(page, "Đà Lạt")).toContainText("2 thành viên");
  await bao.context().close();
});

test("#94 AC 3: a member who opens the group's link goes to the groups list, and nothing changes", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Nhà");
  const link = await makeLink(page, "Nhà");

  await page.goto(link);

  await expect(page).toHaveURL("/");
  await expect(row(page, "Nhà")).toContainText("1 thành viên");
  await expect(groupsList(page).getByRole("listitem")).toHaveCount(1);

  // After someone joins, the creator opening the link again still changes nothing.
  const bao = await secondPerson(browser, `bao-${uniqueEmail(testInfo)}`);
  await bao.goto(link);
  await bao.getByRole("button", { name: "Tham gia nhóm" }).click();
  await expect(bao).toHaveURL("/");
  await bao.goto(link);
  await expect(bao).toHaveURL("/");
  await expect(row(bao, "Nhà")).toContainText("2 thành viên");
  await bao.context().close();
});

test("[security] #94 AC 5, 7: a link that is made up, malformed or replaced shows the same message and no join button", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Nhà");
  const oldLink = await makeLink(page, "Nhà");
  const newLink = await makeLink(page, "Nhà");
  expect(newLink).not.toBe(oldLink);
  const bao = await secondPerson(browser, `bao-${uniqueEmail(testInfo)}`);
  const madeUp = `${WEB_URL}/invite/${"Z".repeat(43)}`;
  const malformed = `${WEB_URL}/invite/short`;

  const seen: string[] = [];
  for (const link of [madeUp, malformed, oldLink]) {
    await bao.goto(link);
    await expect(bao.getByText(BAD_LINK)).toBeVisible();
    await expect(bao.getByRole("button", { name: "Tham gia nhóm" })).toHaveCount(0);
    seen.push(await bao.locator("main").innerText());
  }
  expect(new Set(seen).size).toBe(1);

  // The new link still works.
  await bao.goto(newLink);
  await expect(bao.getByRole("button", { name: "Tham gia nhóm" })).toBeVisible();
  await bao.context().close();
});

test("[security] #94 AC 5, 7: pressing join on a link a member has just replaced shows the same message and joins no one", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Nhà");
  const link = await makeLink(page, "Nhà");
  const bao = await secondPerson(browser, `bao-${uniqueEmail(testInfo)}`);
  await bao.goto(link);
  await expect(bao.getByRole("button", { name: "Tham gia nhóm" })).toBeVisible();

  await makeLink(page, "Nhà");
  await bao.getByRole("button", { name: "Tham gia nhóm" }).click();

  await expect(bao.getByText(BAD_LINK)).toBeVisible();
  await bao.goto("/");
  await expect(bao.getByText("Bạn chưa có nhóm nào.")).toBeVisible();
  await bao.context().close();
});

/** Signs in through the page the browser is on, which must be the sign-in page. */
async function signInHere(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi mã" }).click();
  await expect(page.getByLabel("Mã")).toBeVisible();
  await page.getByLabel("Mã").fill(await devCode(email));
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test("#94 AC 4: a signed-out visitor who opens an invite signs in and comes back to it", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, uniqueEmail(testInfo));
  await createGroup(page, "Đà Lạt");
  const link = await makeLink(page, "Đà Lạt");
  const context = await browser.newContext({ baseURL: WEB_URL });
  const visitor = await context.newPage();

  await visitor.goto(link);

  await expect(visitor).toHaveURL(/\/sign-in\?next=%2Finvite%2F[A-Za-z0-9_-]{43}$/);
  await signInHere(visitor, `bao-${uniqueEmail(testInfo)}`);

  await expect(visitor).toHaveURL(link);
  await expect(
    visitor.getByRole("heading", { name: "Bạn được mời vào nhóm “Đà Lạt”" }),
  ).toBeVisible();
  await visitor.getByRole("button", { name: "Tham gia nhóm" }).click();
  await expect(visitor).toHaveURL("/");
  await expect(row(visitor, "Đà Lạt")).toContainText("2 thành viên");
  await context.close();
});

test("[security] #94 AC 4: a sign-in page opened with a next address that is not an invite goes to the groups list", async ({
  page,
}, testInfo) => {
  await page.goto("/sign-in?next=https%3A%2F%2Fexample.com%2Finvite%2F" + "A".repeat(43));

  await signInHere(page, uniqueEmail(testInfo));

  await expect(page).toHaveURL("/");
});

test("#94 AC 4: a visitor who goes to sign-in without an invite lands on the groups list as before", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(testInfo);
  await goToCodeStep(page, email);
  await page.getByLabel("Mã").fill(await devCode(email));
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL("/");
});
