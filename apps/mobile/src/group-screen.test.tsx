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
  groupsApi: {
    getGroup: jest.fn(),
    listExpenses: jest.fn(),
    createExpense: jest.fn(),
    getBalances: jest.fn(),
    createSettlement: jest.fn(),
  },
}));

const me = jest.mocked(authApi.me);
const signInApi = jest.mocked(authApi.signIn);
const getGroup = jest.mocked(groupsApi.getGroup);
const listExpenses = jest.mocked(groupsApi.listExpenses);
const createExpense = jest.mocked(groupsApi.createExpense);
const getBalances = jest.mocked(groupsApi.getBalances);
const createSettlement = jest.mocked(groupsApi.createSettlement);

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
  getBalances.mockResolvedValue({ ok: true, data: { balances: [], suggestions: [] } });
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

// #107: the save is stored, but the reload that follows it fails.
describe("#107 a failed reload after a save", () => {
  const saved = expense("An toi", 90000, user.id, "2026-11-13T12:00:00.000Z");
  const before = expense("Taxi", 50000, user.id, "2026-11-12T12:00:00.000Z");

  /** Opens the form on a group with one expense and saves, so the reload that follows runs. */
  async function saveAndReload(reload: () => void) {
    listExpenses.mockResolvedValueOnce(listOf(before));
    createExpense.mockResolvedValue({ ok: true, data: saved });
    await renderScreen();
    await openForm();
    await fillForm("90000", "An toi");
    reload();
    await fireEvent.press(screen.getByTestId("save-expense"));
    await screen.findByTestId("group-screen-error");
  }

  test.each([
    ["the API is unreachable", "unavailable"],
    ["the API answers 404", "not_found"],
    ["the API answers 429", "too_many_requests"],
  ] as const)(
    "AC 1: %s: the old rows stay with the error and a retry button, and the form and the add button are gone",
    async (_what, error) => {
      await saveAndReload(() => listExpenses.mockResolvedValueOnce({ ok: false, error }));

      expect(screen.getByTestId("group-screen-error")).toHaveTextContent(groupsCopy.unavailable);
      expect(screen.getByTestId("group-screen-retry")).toBeTruthy();
      expect(texts("expense-description")).toEqual(["Taxi"]);
      expect(screen.getByTestId("group-title")).toHaveTextContent("Da Lat");
      // Nothing to type into, and no way to save, until the reload works.
      expect(screen.queryByTestId("expense-amount-input")).toBeNull();
      expect(screen.queryByTestId("save-expense")).toBeNull();
      expect(screen.queryByTestId("add-expense")).toBeNull();
      expect(createExpense).toHaveBeenCalledTimes(1);
      expect(await secureSessionStore.get()).toBe("old-token");
    },
  );

  test("AC 1: the group call failing, not the expenses, shows the same", async () => {
    await saveAndReload(() => getGroup.mockResolvedValueOnce({ ok: false, error: "unavailable" }));

    expect(texts("expense-description")).toEqual(["Taxi"]);
    expect(screen.queryByTestId("add-expense")).toBeNull();
    expect(screen.queryByTestId("expense-amount-input")).toBeNull();
  });

  test("AC 2: a retry that works shows the new expense once and brings the add button back", async () => {
    await saveAndReload(() =>
      listExpenses.mockResolvedValueOnce({ ok: false, error: "unavailable" }),
    );
    listExpenses.mockResolvedValue(listOf(saved, before));

    await fireEvent.press(screen.getByTestId("group-screen-retry"));
    await screen.findByTestId("add-expense");

    expect(texts("expense-description")).toEqual(["An toi", "Taxi"]);
    expect(screen.queryByTestId("group-screen-error")).toBeNull();
    expect(createExpense).toHaveBeenCalledTimes(1);
  });

  test("the old rows stay and the loading line shows while the retry runs, with no add button", async () => {
    await saveAndReload(() =>
      listExpenses.mockResolvedValueOnce({ ok: false, error: "unavailable" }),
    );
    const held = deferred<GroupAnswer>();
    getGroup.mockReturnValue(held.promise);

    // Not `fireEvent.press`: it waits for the handler, which waits for the held request.
    const { onClick } = screen.getByTestId("group-screen-retry").props;
    await act(async () => {
      onClick({ stopPropagation() {}, preventDefault() {}, nativeEvent: {} });
    });

    expect(screen.getByTestId("expenses-loading")).toBeTruthy();
    expect(texts("expense-description")).toEqual(["Taxi"]);
    expect(screen.queryByTestId("group-screen-error")).toBeNull();
    expect(screen.queryByTestId("add-expense")).toBeNull();
    held.resolve(groupOk);
    await screen.findByTestId("add-expense");
    expect(screen.queryByTestId("expenses-loading")).toBeNull();
  });

  test("a retry that fails again keeps the rows, shows the error again and keeps the add button away", async () => {
    await saveAndReload(() =>
      listExpenses.mockResolvedValueOnce({ ok: false, error: "unavailable" }),
    );
    listExpenses.mockResolvedValueOnce({ ok: false, error: "too_many_requests" });

    await fireEvent.press(screen.getByTestId("group-screen-retry"));
    await screen.findByTestId("group-screen-error");

    expect(texts("expense-description")).toEqual(["Taxi"]);
    expect(screen.queryByTestId("add-expense")).toBeNull();
    expect(screen.queryByTestId("expenses-loading")).toBeNull();
    expect(createExpense).toHaveBeenCalledTimes(1);
  });

  test("A5: two presses on retry before a re-render send one load", async () => {
    await saveAndReload(() =>
      listExpenses.mockResolvedValueOnce({ ok: false, error: "unavailable" }),
    );
    getGroup.mockClear();
    const held = deferred<GroupAnswer>();
    getGroup.mockReturnValue(held.promise);

    await pressTwiceWithoutWaiting("group-screen-retry");
    held.resolve(groupOk);
    await settle();

    expect(getGroup).toHaveBeenCalledTimes(1);
    expect(createExpense).toHaveBeenCalledTimes(1);
  });

  describe("[security] AC 3", () => {
    const unauthorized = { ok: false, error: "unauthorized" } as const;

    test("a 401 on the group in the reload after a save deletes the token and shows sign-in", async () => {
      listExpenses.mockResolvedValueOnce(listOf(before));
      createExpense.mockResolvedValue({ ok: true, data: saved });
      await renderScreen();
      await openForm();
      await fillForm("90000", "An toi");
      getGroup.mockResolvedValueOnce(unauthorized);

      await fireEvent.press(screen.getByTestId("save-expense"));
      await settle();

      expect(await secureSessionStore.get()).toBeNull();
      expect(screen.queryByTestId("group-screen")).toBeNull();
    });

    test("a 401 on the expenses in the reload after a save deletes the token and shows sign-in", async () => {
      listExpenses.mockResolvedValueOnce(listOf(before));
      createExpense.mockResolvedValue({ ok: true, data: saved });
      await renderScreen();
      await openForm();
      await fillForm("90000", "An toi");
      listExpenses.mockResolvedValueOnce(unauthorized);

      await fireEvent.press(screen.getByTestId("save-expense"));
      await settle();

      expect(await secureSessionStore.get()).toBeNull();
      expect(screen.queryByTestId("group-screen")).toBeNull();
    });

    test("a 401 on the retry after a failed reload deletes the token and shows sign-in", async () => {
      await saveAndReload(() =>
        listExpenses.mockResolvedValueOnce({ ok: false, error: "unavailable" }),
      );
      getGroup.mockResolvedValueOnce(unauthorized);

      await fireEvent.press(screen.getByTestId("group-screen-retry"));
      await settle();

      expect(await secureSessionStore.get()).toBeNull();
      expect(screen.queryByTestId("group-screen")).toBeNull();
    });
  });
});

// REVIEW.md: a screen opened by a route parameter has a test for a second value arriving while it
// is open (#98). The route passes `id` straight in, so a new id can reach a mounted screen.
describe("a second group id while the screen is open", () => {
  const other: GroupDetailResponse = { ...detail, id: crypto.randomUUID(), name: "Hue" };
  const tree = (id: string) => (
    <SessionProvider>
      <GroupScreen groupId={id} />
    </SessionProvider>
  );

  test("shows the second group once it loads, not the first", async () => {
    listExpenses.mockResolvedValue(
      listOf(expense("Taxi", 50000, user.id, "2026-11-12T12:00:00.000Z")),
    );
    const view = await render(tree(groupId));
    await screen.findByTestId("group-title");
    getGroup.mockResolvedValue({ ok: true, data: other });
    listExpenses.mockResolvedValue(listOf());

    await view.rerender(tree(other.id));

    await screen.findByTestId("expenses-empty");
    expect(screen.getByTestId("group-title")).toHaveTextContent("Hue");
    expect(getGroup).toHaveBeenLastCalledWith("old-token", other.id);
  });

  test("a failed load of the second group does not keep the first group's title and rows", async () => {
    listExpenses.mockResolvedValue(
      listOf(expense("Taxi", 50000, user.id, "2026-11-12T12:00:00.000Z")),
    );
    const view = await render(tree(groupId));
    await screen.findByTestId("group-title");
    getGroup.mockResolvedValue({ ok: false, error: "unavailable" });

    await view.rerender(tree(other.id));
    await screen.findByTestId("group-screen-error");

    expect(screen.queryByTestId("group-title")).toBeNull();
    expect(screen.queryByTestId("expense-row")).toBeNull();
    expect(screen.queryByTestId("add-expense")).toBeNull();
  });
});

// #134: the balances section.
describe("#134 balances", () => {
  type BalancesAnswer = Awaited<ReturnType<typeof groupsApi.getBalances>>;
  const owed: BalancesAnswer = {
    ok: true,
    data: {
      balances: [
        { userId: user.id, balance: 50000 },
        { userId: bao.userId, balance: -50000 },
      ],
      suggestions: [{ from: bao.userId, to: user.id, amount: 50000 }],
    },
  };
  const unavailable: BalancesAnswer = { ok: false, error: "unavailable" };

  const textOf = (id: string) =>
    screen.getAllByTestId(id).map((node) => {
      const flat = (child: unknown): string =>
        Array.isArray(child) ? child.map(flat).join("") : String(child);
      return flat(node.props.children);
    });

  // AC 1, AC 2, A11
  test("shows a row per member and a line per payment, each with a testID", async () => {
    getBalances.mockResolvedValue(owed);

    await renderScreen();
    await screen.findAllByTestId("balance-row");

    expect(screen.getByTestId("balances-section")).toBeTruthy();
    expect(getBalances).toHaveBeenCalledWith("old-token", groupId);
    expect(screen.getAllByTestId("balance-row")).toHaveLength(2);
    expect(screen.getByText("Bạn")).toBeTruthy();
    expect(screen.getByText("+50.000 ₫")).toBeTruthy();
    expect(screen.getByText("bao@example.com")).toBeTruthy();
    expect(screen.getByText("\u221250.000 ₫")).toBeTruthy();
    expect(textOf("payment-line")).toEqual(["bao@example.com trả Bạn 50.000 ₫"]);
    expect(screen.queryByTestId("balances-settled")).toBeNull();
  });

  // AC 3
  test("all-zero balances show Đã cân bằng, the members at 0 ₫ and no payment line", async () => {
    getBalances.mockResolvedValue({
      ok: true,
      data: {
        balances: [
          { userId: user.id, balance: 0 },
          { userId: bao.userId, balance: 0 },
        ],
        suggestions: [],
      },
    });

    await renderScreen();
    await screen.findAllByTestId("balance-row");

    expect(screen.getByTestId("balances-settled")).toHaveTextContent("Đã cân bằng");
    expect(screen.getAllByText("0 ₫")).toHaveLength(2);
    expect(screen.queryByTestId("payment-line")).toBeNull();
  });

  // A9
  test("shows the loading line and no figures while pending", async () => {
    const held = deferred<BalancesAnswer>();
    getBalances.mockReturnValue(held.promise);

    await renderScreen();

    expect(await screen.findByTestId("balances-loading")).toHaveTextContent("Đang tải số dư…");
    expect(screen.queryByTestId("balance-row")).toBeNull();
    held.resolve(owed);
    await screen.findAllByTestId("balance-row");
    expect(screen.queryByTestId("balances-loading")).toBeNull();
  });

  // AC 4
  test("after a save the balances load again and show the new figures", async () => {
    getBalances.mockResolvedValueOnce(owed).mockResolvedValue({
      ok: true,
      data: {
        balances: [
          { userId: user.id, balance: 10000 },
          { userId: bao.userId, balance: -10000 },
        ],
        suggestions: [{ from: bao.userId, to: user.id, amount: 10000 }],
      },
    });
    createExpense.mockResolvedValue({
      ok: true,
      data: expense("Cafe", 60000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    await renderScreen();
    await screen.findAllByTestId("balance-row");

    await fireEvent.press(await screen.findByTestId("add-expense"));
    await fireEvent.changeText(screen.getByTestId("expense-amount-input"), "60000");
    await fireEvent.changeText(screen.getByTestId("expense-description-input"), "Cafe");
    await fireEvent.press(screen.getByTestId("save-expense"));
    await screen.findByText("+10.000 ₫");

    expect(getBalances).toHaveBeenCalledTimes(2);
    expect(textOf("payment-line")).toEqual(["bao@example.com trả Bạn 10.000 ₫"]);
  });

  // AC 5, A6
  test.each([
    ["a network error", { ok: false, error: "unavailable" }],
    ["a 500", { ok: false, error: "unavailable" }],
  ] as const)(
    "%s shows the error and retry, keeps expenses and the add button",
    async (_n, answer) => {
      listExpenses.mockResolvedValue(
        listOf(expense("Taxi", 50000, user.id, "2026-11-13T12:00:00.000Z")),
      );
      getBalances.mockResolvedValue(answer);

      await renderScreen();

      expect(await screen.findByTestId("balances-error")).toHaveTextContent(groupsCopy.unavailable);
      expect(screen.getByTestId("balances-retry")).toHaveTextContent("Thử lại");
      expect(screen.getAllByTestId("expense-row")).toHaveLength(1);
      expect(screen.getByTestId("add-expense")).toBeTruthy();
      expect(screen.queryByTestId("balance-row")).toBeNull();
    },
  );

  test("the retry reloads only the balances, and two fast presses send one call", async () => {
    getBalances.mockResolvedValueOnce(unavailable);
    await renderScreen();
    await screen.findByTestId("balances-error");
    listExpenses.mockClear();
    getBalances.mockClear();
    const held = deferred<BalancesAnswer>();
    getBalances.mockReturnValue(held.promise);

    const { onClick } = screen.getByTestId("balances-retry").props;
    const press = { stopPropagation() {}, preventDefault() {}, nativeEvent: {} };
    await act(async () => {
      onClick(press);
      onClick(press);
    });
    held.resolve(owed);
    await screen.findAllByTestId("balance-row");

    expect(getBalances).toHaveBeenCalledTimes(1);
    expect(listExpenses).not.toHaveBeenCalled();
    expect(screen.queryByTestId("balances-error")).toBeNull();
  });

  test("a failed reload after a save shows the error, not the old figures", async () => {
    getBalances.mockResolvedValueOnce(owed).mockResolvedValue(unavailable);
    createExpense.mockResolvedValue({
      ok: true,
      data: expense("Cafe", 60000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    await renderScreen();
    await screen.findAllByTestId("balance-row");

    await fireEvent.press(await screen.findByTestId("add-expense"));
    await fireEvent.changeText(screen.getByTestId("expense-amount-input"), "60000");
    await fireEvent.changeText(screen.getByTestId("expense-description-input"), "Cafe");
    await fireEvent.press(screen.getByTestId("save-expense"));

    expect(await screen.findByTestId("balances-error")).toBeTruthy();
    expect(screen.queryByTestId("balance-row")).toBeNull();
    expect(screen.queryByTestId("payment-line")).toBeNull();
  });

  // A5
  test("expense rows show while balances are pending, and balances show with emails while expenses fail", async () => {
    listExpenses.mockResolvedValue(
      listOf(expense("Taxi", 50000, user.id, "2026-11-13T12:00:00.000Z")),
    );
    const held = deferred<BalancesAnswer>();
    getBalances.mockReturnValue(held.promise);
    await renderScreen();
    expect(await screen.findAllByTestId("expense-row")).toHaveLength(1);
    held.resolve(owed);
    await screen.findAllByTestId("balance-row");
  });

  test("balances name members by email even when the expenses call fails", async () => {
    listExpenses.mockResolvedValue({ ok: false, error: "unavailable" });
    getBalances.mockResolvedValue(owed);

    await renderScreen();
    await screen.findAllByTestId("balance-row");

    expect(screen.getByText("bao@example.com")).toBeTruthy();
    expect(screen.queryByText("Thành viên khác")).toBeNull();
    expect(await screen.findByTestId("group-screen-error")).toBeTruthy();
  });

  // AC 6 [security]
  describe("[security]", () => {
    const unauthorized: BalancesAnswer = { ok: false, error: "unauthorized" };

    test("a 401 on the first load deletes the token and shows sign-in", async () => {
      getBalances.mockResolvedValue(unauthorized);

      await renderScreen();
      await settle();

      expect(await secureSessionStore.get()).toBeNull();
      expect(screen.queryByTestId("group-screen")).toBeNull();
    });

    test("a 401 on the retry deletes the token and shows sign-in", async () => {
      getBalances.mockResolvedValueOnce(unavailable);
      await renderScreen();
      await screen.findByTestId("balances-error");
      getBalances.mockResolvedValue(unauthorized);

      await fireEvent.press(screen.getByTestId("balances-retry"));
      await settle();

      expect(await secureSessionStore.get()).toBeNull();
      expect(screen.queryByTestId("group-screen")).toBeNull();
    });

    test("a 401 on the reload after a save deletes the token and shows sign-in", async () => {
      getBalances.mockResolvedValueOnce(owed).mockResolvedValue(unauthorized);
      createExpense.mockResolvedValue({
        ok: true,
        data: expense("Cafe", 60000, user.id, "2026-11-13T12:00:00.000Z"),
      });
      await renderScreen();
      await screen.findAllByTestId("balance-row");

      await fireEvent.press(await screen.findByTestId("add-expense"));
      await fireEvent.changeText(screen.getByTestId("expense-amount-input"), "60000");
      await fireEvent.changeText(screen.getByTestId("expense-description-input"), "Cafe");
      await fireEvent.press(screen.getByTestId("save-expense"));
      await settle();

      expect(await secureSessionStore.get()).toBeNull();
      expect(screen.queryByTestId("group-screen")).toBeNull();
    });

    test("a 500 keeps the token", async () => {
      getBalances.mockResolvedValue(unavailable);

      await renderScreen();
      await screen.findByTestId("balances-error");

      expect(await secureSessionStore.get()).toBe("old-token");
    });
  });
});

// #148: the "Đã trả" button on a payment line.
describe("#148 recording a payment as paid", () => {
  type BalancesAnswer = Awaited<ReturnType<typeof groupsApi.getBalances>>;
  type SettlementAnswer = Awaited<ReturnType<typeof groupsApi.createSettlement>>;
  const balancesWith = (...suggestions: { from: string; to: string; amount: number }[]) =>
    ({
      ok: true,
      data: { balances: [], suggestions },
    }) satisfies BalancesAnswer;
  /** I owe Bao 20.000 ₫. */
  const iOwe = balancesWith({ from: user.id, to: bao.userId, amount: 20000 });
  const settled = balancesWith();
  const stored: SettlementAnswer = {
    ok: true,
    data: {
      id: crypto.randomUUID(),
      groupId,
      payerId: user.id,
      payeeId: bao.userId,
      amount: 20000,
      createdAt: "2026-11-19T10:00:00.000Z",
    },
  };

  const lineTexts = () =>
    screen.queryAllByTestId("payment-line").map((node) => {
      const flat = (child: unknown): string =>
        Array.isArray(child) ? child.map(flat).join("") : String(child);
      return flat(node.props.children);
    });

  // AC 1
  test("AC 1: a line I pay shows a button with the text Đã trả", async () => {
    getBalances.mockResolvedValue(iOwe);

    await renderScreen();
    await screen.findByTestId("payment-line");

    expect(lineTexts()).toEqual(["Bạn trả bao@example.com 20.000 ₫"]);
    expect(screen.getByTestId("pay-button")).toHaveTextContent("Đã trả");
  });

  // AC 13: the positive half is the screen with a line, then the same screen with none.
  test("AC 13: no suggested payments, no button", async () => {
    getBalances.mockResolvedValueOnce(iOwe).mockResolvedValue(settled);
    await renderScreen();
    await screen.findByTestId("pay-button");
    createSettlement.mockResolvedValue(stored);

    await fireEvent.press(screen.getByTestId("pay-button"));
    await screen.findByTestId("balances-settled");

    expect(screen.queryByTestId("pay-button")).toBeNull();
  });

  // AC 15
  test("AC 15: a line where I am not the payer has no button, and my own line has one", async () => {
    getBalances.mockResolvedValue(
      balancesWith(
        { from: bao.userId, to: user.id, amount: 5000 },
        { from: user.id, to: bao.userId, amount: 20000 },
      ),
    );

    await renderScreen();
    await screen.findAllByTestId("payment-line");

    expect(lineTexts()).toEqual([
      "bao@example.com trả Bạn 5.000 ₫",
      "Bạn trả bao@example.com 20.000 ₫",
    ]);
    expect(screen.getAllByTestId("pay-button")).toHaveLength(1);
    createSettlement.mockResolvedValue({ ok: false, error: "unavailable" });
    await fireEvent.press(screen.getByTestId("pay-button"));
    await settle();
    expect(createSettlement).toHaveBeenCalledWith("old-token", groupId, {
      payerId: user.id,
      payeeId: bao.userId,
      amount: 20000,
    });
  });

  // AC 2, 3, A5
  test("AC 3: after a tap the balances load again, the line is gone and the title stays", async () => {
    getBalances.mockResolvedValueOnce(iOwe).mockResolvedValue(settled);
    createSettlement.mockResolvedValue(stored);
    await renderScreen();
    await screen.findByTestId("pay-button");

    await fireEvent.press(screen.getByTestId("pay-button"));
    await screen.findByTestId("balances-settled");

    expect(createSettlement).toHaveBeenCalledTimes(1);
    expect(getBalances).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("payment-line")).toBeNull();
    expect(screen.getByTestId("group-title")).toHaveTextContent("Da Lat");
    expect(screen.queryByTestId("pay-error")).toBeNull();
  });

  test("AC 3: shows the reduced remaining amount when the balances say so", async () => {
    getBalances
      .mockResolvedValueOnce(iOwe)
      .mockResolvedValue(balancesWith({ from: user.id, to: bao.userId, amount: 5000 }));
    createSettlement.mockResolvedValue(stored);
    await renderScreen();
    await screen.findByTestId("pay-button");

    await fireEvent.press(screen.getByTestId("pay-button"));
    await screen.findByText("Bạn trả bao@example.com 5.000 ₫");

    expect(lineTexts()).toEqual(["Bạn trả bao@example.com 5.000 ₫"]);
  });

  // AC 11
  test.each([
    ["a network error or a 5xx", { ok: false, error: "unavailable" } as SettlementAnswer],
    ["a rejected request", { ok: false, error: "invalid_request" } as SettlementAnswer],
  ])(
    "AC 11: %s shows the error and keeps the line, its button and the balances",
    async (_name, answer) => {
      getBalances.mockResolvedValue(iOwe);
      createSettlement.mockResolvedValue(answer);
      await renderScreen();
      await screen.findByTestId("pay-button");

      await fireEvent.press(screen.getByTestId("pay-button"));
      await screen.findByTestId("pay-error");

      expect(screen.getByTestId("pay-error")).toHaveTextContent(groupsCopy.unavailable);
      expect(lineTexts()).toEqual(["Bạn trả bao@example.com 20.000 ₫"]);
      expect(screen.getByTestId("pay-button")).toHaveTextContent("Đã trả");
      expect(getBalances).toHaveBeenCalledTimes(1);
    },
  );

  test("AC 11: a new tap after an error sends the request again and clears the error", async () => {
    getBalances.mockResolvedValueOnce(iOwe).mockResolvedValue(settled);
    createSettlement
      .mockResolvedValueOnce({ ok: false, error: "unavailable" })
      .mockResolvedValue(stored);
    await renderScreen();
    await screen.findByTestId("pay-button");
    await fireEvent.press(screen.getByTestId("pay-button"));
    await screen.findByTestId("pay-error");

    await fireEvent.press(screen.getByTestId("pay-button"));
    await screen.findByTestId("balances-settled");

    expect(createSettlement).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("pay-error")).toBeNull();
  });

  // AC 12: both presses land before React re-renders, so only the ref guard can stop the second.
  test("AC 12: two taps before the first call answers send one request, and the button is disabled", async () => {
    getBalances.mockResolvedValueOnce(iOwe).mockResolvedValue(settled);
    const held = deferred<SettlementAnswer>();
    createSettlement.mockReturnValue(held.promise);
    await renderScreen();
    await screen.findByTestId("pay-button");

    await pressTwiceWithoutWaiting("pay-button");

    expect(screen.getByTestId("pay-button").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    held.resolve(stored);
    await settle();
    expect(createSettlement).toHaveBeenCalledTimes(1);
  });

  test("AC 12: while one payment is in progress no line's button can send another", async () => {
    getBalances.mockResolvedValue(
      balancesWith(
        { from: user.id, to: bao.userId, amount: 20000 },
        { from: user.id, to: crypto.randomUUID(), amount: 1000 },
      ),
    );
    const held = deferred<SettlementAnswer>();
    createSettlement.mockReturnValue(held.promise);
    await renderScreen();
    await screen.findAllByTestId("pay-button");

    const [first, second] = screen.getAllByTestId("pay-button");
    const press = { stopPropagation() {}, preventDefault() {}, nativeEvent: {} };
    await act(async () => {
      first?.props.onClick(press);
      second?.props.onClick(press);
    });

    expect(createSettlement).toHaveBeenCalledTimes(1);
    for (const button of screen.getAllByTestId("pay-button")) {
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    }
    held.resolve({ ok: false, error: "unavailable" });
    await settle();
  });

  // AC 16
  test("AC 16: a stored payment and a failed reload show the balances error and no button until the retry works", async () => {
    getBalances
      .mockResolvedValueOnce(iOwe)
      .mockResolvedValueOnce({ ok: false, error: "unavailable" })
      .mockResolvedValue(balancesWith({ from: user.id, to: bao.userId, amount: 5000 }));
    createSettlement.mockResolvedValue(stored);
    await renderScreen();
    await screen.findByTestId("pay-button");

    await fireEvent.press(screen.getByTestId("pay-button"));
    await screen.findByTestId("balances-error");

    expect(screen.getByTestId("balances-retry")).toBeTruthy();
    expect(screen.queryByTestId("pay-button")).toBeNull();
    expect(screen.queryByTestId("payment-line")).toBeNull();

    await fireEvent.press(screen.getByTestId("balances-retry"));
    await screen.findByTestId("payment-line");

    expect(lineTexts()).toEqual(["Bạn trả bao@example.com 5.000 ₫"]);
    expect(screen.getAllByTestId("pay-button")).toHaveLength(1);
    expect(createSettlement).toHaveBeenCalledTimes(1);
  });

  // [security]
  test("[security] a 401 on the payment deletes the token and shows sign-in", async () => {
    getBalances.mockResolvedValue(iOwe);
    createSettlement.mockResolvedValue({ ok: false, error: "unauthorized" });
    await renderScreen();
    await screen.findByTestId("pay-button");

    await fireEvent.press(screen.getByTestId("pay-button"));
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(screen.queryByTestId("group-screen")).toBeNull();
  });
});
