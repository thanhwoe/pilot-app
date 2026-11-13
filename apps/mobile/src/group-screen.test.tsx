import {
  type ExpenseResponse,
  formatAmountInput,
  type GroupDetailResponse,
  groupsCopy,
} from "@gop/shared";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { GroupScreen } from "@/group-screen";
import { authApi, groupsApi } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { secureSessionStore } from "@/lib/session-store";

// The real screen, session provider and shared flows run here. Only the network is faked (the API
// clients) and the keychain (an in-memory store).
jest.mock("expo-secure-store", () => require("@/test-support/secure-store-mock").secureStoreMock());

jest.mock("@/lib/api", () => ({
  apiUrl: "http://api.test",
  authApi: { requestCode: jest.fn(), signIn: jest.fn(), me: jest.fn(), signOut: jest.fn() },
  groupsApi: { getGroup: jest.fn(), listExpenses: jest.fn(), createExpense: jest.fn() },
}));

const me = jest.mocked(authApi.me);
const signInApi = jest.mocked(authApi.signIn);
const getGroup = jest.mocked(groupsApi.getGroup);
const listExpenses = jest.mocked(groupsApi.listExpenses);
const createExpense = jest.mocked(groupsApi.createExpense);

const user = { id: crypto.randomUUID(), email: "an@example.com" };
const bao = { userId: crypto.randomUUID(), email: "bao@example.com" };
const groupId = crypto.randomUUID();
const detail: GroupDetailResponse = {
  id: groupId,
  name: "Da Lat",
  memberCount: 2,
  createdAt: "2026-11-01T00:00:00.000Z",
  members: [{ userId: user.id, email: user.email }, bao],
};

/** Noon UTC, so the date is the same in every time zone from UTC-12 to UTC+11. */
function expense(description: string, amount: number, payerId: string, createdAt: string) {
  return {
    id: crypto.randomUUID(),
    groupId,
    payerId,
    amount,
    description,
    createdAt,
    shares: [],
  } satisfies ExpenseResponse;
}

type GroupAnswer = Awaited<ReturnType<typeof groupsApi.getGroup>>;
type CreateAnswer = Awaited<ReturnType<typeof groupsApi.createExpense>>;
type ListAnswer = Awaited<ReturnType<typeof groupsApi.listExpenses>>;
const groupOk: GroupAnswer = { ok: true, data: detail };
const listOf = (...expenses: ExpenseResponse[]): ListAnswer => ({
  ok: true,
  data: { expenses },
});

/** A request the test answers when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets every promise already answered run its continuations. */
async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

/** The group screen while a session exists; otherwise a stand-in for the sign-in screen. */
function Screens(): ReactNode {
  const { state } = useSession();
  if (state.kind === "loading") {
    return null;
  }
  if (state.kind === "clear") {
    return null;
  }
  return <GroupScreen groupId={groupId} />;
}

async function renderScreen() {
  await render(
    <SessionProvider>
      <Screens />
    </SessionProvider>,
  );
}

beforeEach(async () => {
  jest.resetAllMocks();
  me.mockResolvedValue({ ok: true, data: user });
  signInApi.mockResolvedValue({ ok: true, data: { token: "new-token", user } });
  getGroup.mockResolvedValue(groupOk);
  listExpenses.mockResolvedValue(listOf());
  await secureSessionStore.set("old-token");
});

const texts = (testID: string) => screen.getAllByTestId(testID).map((node) => node.props.children);

// #97 AC 1
test("shows the group's name", async () => {
  await renderScreen();

  expect(await screen.findByTestId("group-title")).toHaveTextContent("Da Lat");
  expect(getGroup).toHaveBeenCalledWith("old-token", groupId);
  expect(listExpenses).toHaveBeenCalledWith("old-token", groupId);
});

// #97 AC 2
test("lists the expenses as the API gives them, newest first, with amount, date and payer", async () => {
  listExpenses.mockResolvedValue(
    listOf(
      expense("Taxi", 50000, user.id, "2026-11-13T12:00:00.000Z"),
      expense("An toi", 90000, bao.userId, "2026-11-12T12:00:00.000Z"),
    ),
  );

  await renderScreen();
  await screen.findAllByTestId("expense-row");

  expect(texts("expense-description")).toEqual(["Taxi", "An toi"]);
  expect(texts("expense-amount")).toEqual(["50.000 ₫", "90.000 ₫"]);
  expect(texts("expense-payer")).toEqual(["Bạn đã trả", "bao@example.com đã trả"]);
  expect(screen.getAllByTestId("expense-date")).toHaveLength(2);
  for (const date of texts("expense-date")) {
    expect(date).toMatch(/^\d{2}\/\d{2}\/2026$/);
  }
});

// #97 AC 3
test("a group with no expenses shows the empty state and the add button, and no list", async () => {
  await renderScreen();

  expect(await screen.findByTestId("expenses-empty")).toHaveTextContent(
    "Nhóm này chưa có chi tiêu nào.",
  );
  expect(screen.getByTestId("add-expense")).toHaveTextContent("Thêm chi tiêu");
  expect(screen.queryByTestId("expense-row")).toBeNull();
});

test("shows the loading line until the group and its expenses answer", async () => {
  const held = deferred<GroupAnswer>();
  getGroup.mockReturnValue(held.promise);

  await renderScreen();
  await screen.findByTestId("group-screen");

  expect(screen.getByTestId("expenses-loading")).toHaveTextContent("Đang tải chi tiêu…");
  expect(screen.queryByTestId("expenses-empty")).toBeNull();

  held.resolve(groupOk);
  await screen.findByTestId("expenses-empty");
  expect(screen.queryByTestId("expenses-loading")).toBeNull();
});

// #97 A9
test("a failed first load shows the connection error and a retry button, keeps the token, and the retry loads", async () => {
  getGroup.mockResolvedValueOnce({ ok: false, error: "unavailable" });

  await renderScreen();
  expect(await screen.findByTestId("group-screen-error")).toHaveTextContent(groupsCopy.unavailable);
  expect(await secureSessionStore.get()).toBe("old-token");

  await fireEvent.press(screen.getByTestId("group-screen-retry"));

  expect(await screen.findByTestId("group-title")).toHaveTextContent("Da Lat");
  expect(screen.queryByTestId("group-screen-error")).toBeNull();
});

test("two presses on retry before a re-render send one load", async () => {
  getGroup.mockResolvedValueOnce({ ok: false, error: "unavailable" });
  await renderScreen();
  await screen.findByTestId("group-screen-error");
  getGroup.mockClear();
  const held = deferred<GroupAnswer>();
  getGroup.mockReturnValue(held.promise);

  const { onClick } = screen.getByTestId("group-screen-retry").props;
  const press = { stopPropagation() {}, preventDefault() {}, nativeEvent: {} };
  await act(async () => {
    onClick(press);
    onClick(press);
  });
  held.resolve(groupOk);
  await settle();

  expect(getGroup).toHaveBeenCalledTimes(1);
});

// #97 AC 9: a 401 ends the session; anything else keeps it.
describe("[security] a rejected session", () => {
  const unauthorized = { ok: false, error: "unauthorized" } as const;

  test("a 401 on the group deletes the token and shows sign-in", async () => {
    getGroup.mockResolvedValue(unauthorized);

    await renderScreen();
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(screen.queryByTestId("group-screen")).toBeNull();
  });

  test("a 401 on the expenses deletes the token and shows sign-in", async () => {
    listExpenses.mockResolvedValue(unauthorized);

    await renderScreen();
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(screen.queryByTestId("group-screen")).toBeNull();
  });

  test("a 401 on a retry deletes the token and shows sign-in", async () => {
    getGroup.mockResolvedValueOnce({ ok: false, error: "unavailable" });
    await renderScreen();
    await screen.findByTestId("group-screen-error");
    getGroup.mockResolvedValue(unauthorized);

    await fireEvent.press(screen.getByTestId("group-screen-retry"));
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(screen.queryByTestId("group-screen")).toBeNull();
  });

  test.each(["unavailable", "not_found", "too_many_requests"] as const)(
    "a failure with %s keeps the token",
    async (error) => {
      listExpenses.mockResolvedValue({ ok: false, error });

      await renderScreen();
      await screen.findByTestId("group-screen-error");

      expect(await secureSessionStore.get()).toBe("old-token");
    },
  );
});

test("a screen that unmounts before its answer shows nothing and expires nothing", async () => {
  const held = deferred<GroupAnswer>();
  getGroup.mockReturnValue(held.promise);
  const view = await render(
    <SessionProvider>
      <Screens />
    </SessionProvider>,
  );
  await screen.findByTestId("group-screen");

  await view.unmount();
  held.resolve({ ok: false, error: "unauthorized" });
  await settle();

  expect(await secureSessionStore.get()).toBe("old-token");
});

// #97 step 7: adding an expense.
async function openForm() {
  await screen.findByTestId("add-expense");
  await fireEvent.press(screen.getByTestId("add-expense"));
}

async function fillForm(amount: string, description: string) {
  await fireEvent.changeText(screen.getByTestId("expense-amount-input"), amount);
  await fireEvent.changeText(screen.getByTestId("expense-description-input"), description);
}

/** Presses a button twice before React can re-render, as a fast double tap does. */
async function pressTwiceWithoutWaiting(testID: string) {
  const { onClick } = screen.getByTestId(testID).props;
  const press = { stopPropagation() {}, preventDefault() {}, nativeEvent: {} };
  await act(async () => {
    onClick(press);
    onClick(press);
  });
}

describe("the add form", () => {
  test("#97 AC 4: the add button opens a form with an amount and a description", async () => {
    await renderScreen();
    expect(screen.queryByTestId("expense-amount-input")).toBeNull();

    await openForm();

    expect(screen.getByTestId("expense-amount-input")).toBeTruthy();
    expect(screen.getByTestId("expense-description-input")).toBeTruthy();
    expect(screen.getByTestId("save-expense")).toHaveTextContent("Lưu");
    expect(screen.getByLabelText("Số tiền")).toBeTruthy();
    expect(screen.getByLabelText("Mô tả")).toBeTruthy();
  });

  test("#97 AC 5: keeps only digits, grouped by three, and ignores a tenth digit", async () => {
    await renderScreen();
    await openForm();
    const amount = () => screen.getByTestId("expense-amount-input").props.value;

    await fireEvent.changeText(screen.getByTestId("expense-amount-input"), "12a3,4.5");
    expect(amount()).toBe("12.345");

    await fireEvent.changeText(screen.getByTestId("expense-amount-input"), "123.456.7890");
    expect(amount()).toBe("123.456.789");
    await fireEvent.changeText(screen.getByTestId("expense-amount-input"), "1234567891");
    expect(amount()).toBe("123.456.789");
  });

  test("#97 A10: the description field takes at most 200 characters", async () => {
    await renderScreen();
    await openForm();

    expect(screen.getByTestId("expense-description-input").props.maxLength).toBe(200);
  });

  // #97 AC 4, A2: the list is what the API answers to the reload, not what the form sent.
  test("saving sends me as the payer and every member, reloads the list, closes the form and shows what the API answers", async () => {
    createExpense.mockResolvedValue({
      ok: true,
      data: expense("An toi", 90000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    listExpenses
      .mockResolvedValueOnce(listOf())
      .mockResolvedValueOnce(listOf(expense("Tu API", 90000, user.id, "2026-11-13T12:00:00.000Z")));
    await renderScreen();
    await openForm();

    await fillForm("90000", "  An toi ");
    await fireEvent.press(screen.getByTestId("save-expense"));
    await screen.findByTestId("expense-row");

    expect(createExpense).toHaveBeenCalledWith("old-token", groupId, {
      payerId: user.id,
      amount: 90000,
      description: "An toi",
      splitBetween: [user.id, bao.userId],
    });
    expect(listExpenses).toHaveBeenCalledTimes(2);
    expect(texts("expense-description")).toEqual(["Tu API"]);
    expect(screen.queryByTestId("expense-amount-input")).toBeNull();
    expect(screen.queryByTestId("expenses-empty")).toBeNull();
  });

  test.each([
    ["", "An toi", "Hãy nhập số tiền."],
    ["0", "An toi", "Hãy nhập số tiền."],
    ["100.000.001", "An toi", "Số tiền tối đa là 100.000.000 ₫."],
    ["90000", "", "Hãy nhập mô tả."],
    ["90000", "    ", "Hãy nhập mô tả."],
  ])(
    "#97 AC 6: amount %j and description %j show %j, send nothing and keep what was typed",
    async (amount, description, message) => {
      await renderScreen();
      await openForm();

      await fillForm(amount, description);
      await fireEvent.press(screen.getByTestId("save-expense"));

      expect(await screen.findByTestId("expense-form-error")).toHaveTextContent(message);
      expect(createExpense).not.toHaveBeenCalled();
      expect(screen.getByTestId("expense-description-input").props.value).toBe(description);
      expect(screen.getByTestId("expense-amount-input").props.value).toBe(
        formatAmountInput(amount),
      );
    },
  );

  test.each([
    ["unreachable", "unavailable"],
    ["a 400", "invalid_request"],
    ["a 404", "not_found"],
  ] as const)(
    "#97 AC 7: %s shows the error, keeps what was typed and adds no row",
    async (_what, error) => {
      createExpense.mockResolvedValue({ ok: false, error });
      await renderScreen();
      await openForm();

      await fillForm("90000", "An toi");
      await fireEvent.press(screen.getByTestId("save-expense"));

      expect(await screen.findByTestId("expense-form-error")).toHaveTextContent(
        groupsCopy.unavailable,
      );
      expect(screen.getByTestId("expense-amount-input").props.value).toBe("90.000");
      expect(screen.getByTestId("expense-description-input").props.value).toBe("An toi");
      expect(screen.queryByTestId("expense-row")).toBeNull();
      expect(listExpenses).toHaveBeenCalledTimes(1);
      expect(await secureSessionStore.get()).toBe("old-token");
    },
  );

  // #97 AC 8: both presses land before React re-renders, so the disabled button can't stop the
  // second one; only the ref guard can. Maestro taps too slowly to reach this.
  test("two presses on save before a re-render send one request", async () => {
    const held = deferred<CreateAnswer>();
    createExpense.mockReturnValue(held.promise);
    await renderScreen();
    await openForm();
    await fillForm("90000", "An toi");

    await pressTwiceWithoutWaiting("save-expense");
    held.resolve({
      ok: true,
      data: expense("An toi", 90000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    await settle();

    expect(createExpense).toHaveBeenCalledTimes(1);
  });

  test("the save button is disabled while the request runs", async () => {
    const held = deferred<CreateAnswer>();
    createExpense.mockReturnValue(held.promise);
    await renderScreen();
    await openForm();
    await fillForm("90000", "An toi");

    // The press hands back the handler's promise, which this test holds open: don't await it.
    const { onClick } = screen.getByTestId("save-expense").props;
    await act(async () => {
      onClick({ stopPropagation() {}, preventDefault() {}, nativeEvent: {} });
    });

    expect(screen.getByTestId("save-expense").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    held.resolve({ ok: false, error: "unavailable" });
    await settle();
  });

  test("[security] #97 AC 9: a 401 on the save deletes the token and shows sign-in", async () => {
    createExpense.mockResolvedValue({ ok: false, error: "unauthorized" });
    await renderScreen();
    await openForm();

    await fillForm("90000", "An toi");
    await fireEvent.press(screen.getByTestId("save-expense"));
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(screen.queryByTestId("group-screen")).toBeNull();
  });

  // #97 A6: the split is the members the screen last loaded.
  test("a member who joined after the first load is in the next save once the screen has reloaded", async () => {
    const chi = { userId: crypto.randomUUID(), email: "chi@example.com" };
    createExpense.mockResolvedValue({
      ok: true,
      data: expense("An toi", 90000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    await renderScreen();
    await openForm();
    await fillForm("90000", "An toi");
    getGroup.mockResolvedValue({
      ok: true,
      data: { ...detail, memberCount: 3, members: [...detail.members, chi] },
    });
    await fireEvent.press(screen.getByTestId("save-expense"));
    await settle();
    expect(createExpense.mock.calls[0]?.[2].splitBetween).toEqual([user.id, bao.userId]);

    await openForm();
    await fillForm("50000", "Taxi");
    await fireEvent.press(screen.getByTestId("save-expense"));
    await settle();

    expect(createExpense.mock.calls[1]?.[2].splitBetween).toEqual([
      user.id,
      bao.userId,
      chi.userId,
    ]);
  });

  test("#97 A10: a description of 200 characters is saved", async () => {
    createExpense.mockResolvedValue({
      ok: true,
      data: expense("a", 1000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    await renderScreen();
    await openForm();

    await fillForm("1000", "a".repeat(200));
    await fireEvent.press(screen.getByTestId("save-expense"));
    await settle();

    expect(createExpense.mock.calls[0]?.[2].description).toHaveLength(200);
  });
});
