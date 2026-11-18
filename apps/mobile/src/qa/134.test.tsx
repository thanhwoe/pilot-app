import {
  type BalancesResponse,
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
    getBalances: jest.fn(), // QA guess: the client call's name
  },
}));

const me = jest.mocked(authApi.me);
const signInApi = jest.mocked(authApi.signIn);
const getGroup = jest.mocked(groupsApi.getGroup);
const listExpenses = jest.mocked(groupsApi.listExpenses);
const createExpense = jest.mocked(groupsApi.createExpense);
const getBalances = jest.mocked(groupsApi.getBalances);

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

async function openForm() {
  await screen.findByTestId("add-expense");
  await fireEvent.press(screen.getByTestId("add-expense"));
}

async function fillForm(amount: string, description: string) {
  await fireEvent.changeText(screen.getByTestId("expense-amount-input"), amount);
  await fireEvent.changeText(screen.getByTestId("expense-description-input"), description);
}

type BalancesAnswer = Awaited<ReturnType<typeof groupsApi.getBalances>>;
const balancesOf = (data: BalancesResponse): BalancesAnswer => ({ ok: true, data });
const unauthorized = { ok: false, error: "unauthorized" } as const;
const unavailable = { ok: false, error: "unavailable" } as const;

// QA guess: testIDs "balances-section", "balance-row", "payment-line", "balances-settled",
// "balances-loading", "balances-error", "balances-retry". The spec only says each part has one.
const rows = () => screen.getAllByTestId("balance-row").map((n) => flat(n));
const lines = () => screen.getAllByTestId("payment-line").map((n) => flat(n));
function flat(node: { props: { children?: unknown } }): string {
  const walk = (c: unknown): string =>
    Array.isArray(c)
      ? c.map(walk).join("")
      : typeof c === "object" && c !== null && "props" in c
        ? walk((c as { props: { children?: unknown } }).props.children)
        : c == null
          ? ""
          : String(c);
  return walk(node.props.children);
}

beforeEach(async () => {
  jest.resetAllMocks();
  me.mockResolvedValue({ ok: true, data: user });
  signInApi.mockResolvedValue({ ok: true, data: { token: "new-token", user } });
  getGroup.mockResolvedValue(groupOk);
  listExpenses.mockResolvedValue(listOf());
  getBalances.mockResolvedValue(balancesOf({ balances: [], suggestions: [] }));
  await secureSessionStore.set("old-token");
});

const owed = balancesOf({
  balances: [
    { userId: user.id, balance: 50000 },
    { userId: bao.userId, balance: -50000 },
  ],
  suggestions: [{ from: bao.userId, to: user.id, amount: 50000 }],
});

test("#134 AC 1: every member shows with a signed whole-VND balance", async () => {
  getBalances.mockResolvedValue(owed);
  await renderScreen();
  await screen.findAllByTestId("balance-row");

  expect(getBalances).toHaveBeenCalledWith("old-token", groupId);
  expect(rows()).toHaveLength(2);
  const all = rows().join("|");
  expect(all).toContain("Bạn");
  expect(all).toMatch(/\+50\.000 ₫/);
  expect(all).toContain("bao@example.com");
  expect(all).toMatch(/−50\.000 ₫/);
});

test("#134 AC 2: payments show as lines, with Bạn on either side", async () => {
  getBalances.mockResolvedValue(
    balancesOf({
      balances: owed.ok ? owed.data.balances : [],
      suggestions: [
        { from: bao.userId, to: user.id, amount: 50000 },
        { from: user.id, to: bao.userId, amount: 20000 },
      ],
    }),
  );
  await renderScreen();
  await screen.findAllByTestId("payment-line");

  const text = lines().join("|");
  expect(text).toContain("bao@example.com trả Bạn 50.000 ₫");
  expect(text).toContain("Bạn trả bao@example.com 20.000 ₫");
});

test("#134 AC 3: a group with all balances at 0 says Đã cân bằng, no payment lines, members at 0 ₫", async () => {
  getBalances.mockResolvedValue(
    balancesOf({
      balances: [
        { userId: user.id, balance: 0 },
        { userId: bao.userId, balance: 0 },
      ],
      suggestions: [],
    }),
  );
  await renderScreen();

  expect(await screen.findByTestId("balances-settled")).toHaveTextContent("Đã cân bằng");
  expect(screen.queryAllByTestId("payment-line")).toHaveLength(0);
  expect(rows()).toHaveLength(2);
  for (const row of rows()) {
    expect(row).toMatch(/0 ₫/);
  }
});

test("#134 AC 4: after a saved expense the balances are loaded again and the new figures show", async () => {
  getBalances
    .mockResolvedValueOnce(balancesOf({ balances: [], suggestions: [] }))
    .mockResolvedValue(owed);
  createExpense.mockResolvedValue({
    ok: true,
    data: expense("An toi", 100000, user.id, "2026-11-13T12:00:00.000Z"),
  });
  await renderScreen();
  await openForm();
  await fillForm("100000", "An toi");
  await fireEvent.press(screen.getByTestId("save-expense"));

  await screen.findAllByTestId("payment-line");
  expect(getBalances).toHaveBeenCalledTimes(2);
  expect(lines().join("|")).toContain("bao@example.com trả Bạn 50.000 ₫");
  expect(screen.getByTestId("add-expense")).toBeTruthy();
});

describe("#134 AC 5: a balances failure", () => {
  beforeEach(() => {
    listExpenses.mockResolvedValue(
      listOf(expense("Taxi", 50000, user.id, "2026-11-13T12:00:00.000Z")),
    );
  });

  test.each([
    ["a network error", { ok: false, error: "unavailable" }],
    ["a 500", { ok: false, error: "server_error" }],
  ] as const)(
    "%s keeps the expenses and the add button, shows the error and no figures",
    async (_n, answer) => {
      getBalances.mockResolvedValue(answer as unknown as BalancesAnswer);
      await renderScreen();

      expect(await screen.findByTestId("balances-error")).toBeTruthy();
      expect(screen.getByTestId("balances-retry")).toHaveTextContent("Thử lại");
      expect(screen.getAllByTestId("expense-row")).toHaveLength(1);
      expect(screen.getByTestId("add-expense")).toBeTruthy();
      expect(screen.queryAllByTestId("balance-row")).toHaveLength(0);
      expect(screen.queryAllByTestId("payment-line")).toHaveLength(0);
    },
  );

  test("the retry calls only the balances and shows them", async () => {
    getBalances.mockResolvedValueOnce(unavailable);
    await renderScreen();
    await screen.findByTestId("balances-error");
    getGroup.mockClear();
    listExpenses.mockClear();
    getBalances.mockResolvedValue(owed);

    await fireEvent.press(screen.getByTestId("balances-retry"));
    await screen.findAllByTestId("balance-row");

    expect(getGroup).not.toHaveBeenCalled();
    expect(listExpenses).not.toHaveBeenCalled();
    expect(screen.queryByTestId("balances-error")).toBeNull();
  });

  test("two presses on retry send one call", async () => {
    getBalances.mockResolvedValueOnce(unavailable);
    await renderScreen();
    await screen.findByTestId("balances-error");
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
    await settle();

    expect(getBalances).toHaveBeenCalledTimes(1);
  });

  test("a failed reload after a save shows the error, never the old figures", async () => {
    getBalances.mockResolvedValueOnce(owed).mockResolvedValue(unavailable);
    createExpense.mockResolvedValue({
      ok: true,
      data: expense("An toi", 90000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    await renderScreen();
    await screen.findAllByTestId("balance-row");
    await openForm();
    await fillForm("90000", "An toi");
    await fireEvent.press(screen.getByTestId("save-expense"));

    expect(await screen.findByTestId("balances-error")).toBeTruthy();
    expect(screen.queryAllByTestId("balance-row")).toHaveLength(0);
    expect(screen.queryAllByTestId("payment-line")).toHaveLength(0);
  });
});

describe("#134 AC 6 [security]: a rejected session", () => {
  test("a 401 on the first load deletes the token and shows sign-in", async () => {
    getBalances.mockResolvedValue(unauthorized);
    await renderScreen();
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
    expect(screen.queryByTestId("group-screen")).toBeNull();
  });

  test("a 401 on the reload after a save deletes the token", async () => {
    getBalances.mockResolvedValueOnce(owed).mockResolvedValue(unauthorized);
    createExpense.mockResolvedValue({
      ok: true,
      data: expense("An toi", 90000, user.id, "2026-11-13T12:00:00.000Z"),
    });
    await renderScreen();
    await screen.findAllByTestId("balance-row");
    await openForm();
    await fillForm("90000", "An toi");
    await fireEvent.press(screen.getByTestId("save-expense"));
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
  });

  test("a 401 on the retry deletes the token", async () => {
    getBalances.mockResolvedValueOnce(unavailable);
    await renderScreen();
    await screen.findByTestId("balances-error");
    getBalances.mockResolvedValue(unauthorized);

    await fireEvent.press(screen.getByTestId("balances-retry"));
    await settle();

    expect(await secureSessionStore.get()).toBeNull();
  });

  test("a 500 keeps the token", async () => {
    getBalances.mockResolvedValue({
      ok: false,
      error: "server_error",
    } as unknown as BalancesAnswer);
    await renderScreen();
    await screen.findByTestId("balances-error");

    expect(await secureSessionStore.get()).toBe("old-token");
  });
});

test("#134 A5: expenses show while balances is pending, and balances show while expenses fail", async () => {
  listExpenses.mockResolvedValue(
    listOf(expense("Taxi", 50000, user.id, "2026-11-13T12:00:00.000Z")),
  );
  const held = deferred<BalancesAnswer>();
  getBalances.mockReturnValue(held.promise);
  await renderScreen();
  expect(await screen.findByTestId("expense-row")).toBeTruthy();
  held.resolve(owed);
  await settle();

  getBalances.mockResolvedValue(owed);
  listExpenses.mockResolvedValue(unavailable as unknown as ListAnswer);
  await renderScreen();
  expect(await screen.findAllByTestId("balance-row")).toHaveLength(2);
});

test("#134 A8: a user missing from the member list shows Thành viên khác and is not dropped", async () => {
  const ghost = crypto.randomUUID();
  getBalances.mockResolvedValue(
    balancesOf({
      balances: [
        { userId: user.id, balance: 10000 },
        { userId: ghost, balance: -10000 },
      ],
      suggestions: [{ from: ghost, to: user.id, amount: 10000 }],
    }),
  );
  await renderScreen();
  await screen.findAllByTestId("balance-row");

  expect(rows().join("|")).toContain("Thành viên khác");
  expect(lines().join("|")).toContain("Thành viên khác trả Bạn 10.000 ₫");
});

test("#134 A9: while balances are pending the section shows a loading line and no figures", async () => {
  getBalances.mockReturnValue(deferred<BalancesAnswer>().promise);
  await renderScreen();

  expect(await screen.findByTestId("balances-loading")).toBeTruthy();
  expect(screen.queryAllByTestId("balance-row")).toHaveLength(0);
  expect(screen.queryAllByTestId("payment-line")).toHaveLength(0);
});

test("#134 A11: the section has a testID", async () => {
  await renderScreen();
  expect(await screen.findByTestId("balances-section")).toBeTruthy();
});
