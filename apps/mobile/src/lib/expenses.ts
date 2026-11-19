import {
  type BalancesState,
  expensesCopy,
  type GroupScreenState,
  loadBalances,
  loadGroupScreen,
  type RecordSettlementOutcome,
  recordSettlement,
  type SaveExpenseOutcome,
  settlementsCopy,
  submitExpense,
} from "@gop/shared";
import { groupsApi } from "./api";
import { secureSessionStore } from "./session-store";

/** The stored token, read for each call so it never enters screen state; null if it can't be read. */
async function readToken(): Promise<string | null> {
  try {
    return await secureSessionStore.get();
  } catch {
    return null;
  }
}

/**
 * A group, its members and its expenses; `signed-out` when the API rejected the session, which
 * the caller must answer by expiring the session; otherwise the connection error.
 */
export async function loadMyGroupScreen(groupId: string): Promise<GroupScreenState> {
  const token = await readToken();
  return token ? loadGroupScreen(groupsApi, token, groupId) : { kind: "unavailable" };
}

/** Saves an expense paid by me and split equally between `memberIds`. */
export async function saveMyExpense(values: {
  groupId: string;
  myId: string;
  memberIds: string[];
  amount: number;
  description: string;
}): Promise<SaveExpenseOutcome> {
  const token = await readToken();
  if (!token) {
    return { saved: false, error: expensesCopy.unavailable };
  }
  return submitExpense(groupsApi, token, values);
}

/** The group's balances with their own member list; `signed-out` when the API rejected the session. */
export async function loadMyBalances(groupId: string): Promise<BalancesState> {
  const token = await readToken();
  return token ? loadBalances(groupsApi, token, groupId) : { kind: "unavailable" };
}

/** Records that I paid `payeeId` the amount a payment line showed. */
export async function recordMyPayment(payment: {
  groupId: string;
  myId: string;
  payeeId: string;
  amount: number;
}): Promise<RecordSettlementOutcome> {
  const token = await readToken();
  if (!token) {
    return { saved: false, error: settlementsCopy.unavailable };
  }
  return recordSettlement(groupsApi, token, payment);
}
