import { type ExpenseResponse, type GroupDetailResponse, groupsCopy } from "@gop/shared";
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
