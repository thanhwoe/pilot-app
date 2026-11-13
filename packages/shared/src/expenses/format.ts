import { expensesCopy } from "../groups/copy";

/** The most digits the amount field takes: 999.999.999 is above the 100.000.000 limit, so the
 * form can still say the amount is too large instead of silently cutting it. */
const AMOUNT_INPUT_MAX_DIGITS = 9;

/** `90000` as `90.000 ₫`: whole VND, a dot between groups of three. */
export function formatVnd(amount: number): string {
  return `${groupThousands(String(amount))} ₫`;
}

/** What the amount field shows for what was typed or pasted: digits only, grouped by three. */
export function formatAmountInput(text: string): string {
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return groupThousands(digits.slice(0, AMOUNT_INPUT_MAX_DIGITS));
}

/** The whole number in the amount field; 0 for an empty one. */
export function parseAmountInput(text: string): number {
  return Number(text.replace(/\D/g, "")) || 0;
}

/**
 * `dd/MM/yyyy` for an ISO time in the given offset from UTC, in minutes (the device's, which a
 * screen reads from its clock, so a test passes its own).
 */
export function formatExpenseDate(createdAt: string, utcOffsetMinutes: number): string {
  const local = new Date(new Date(createdAt).getTime() + utcOffsetMinutes * 60_000);
  const day = String(local.getUTCDate()).padStart(2, "0");
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${local.getUTCFullYear()}`;
}

/** The line under an expense's description: me, another member's email, or a member we don't know. */
export function payerLine(
  payerId: string,
  myId: string,
  members: { userId: string; email: string }[],
): string {
  if (payerId === myId) {
    return expensesCopy.paidByMe;
  }
  const payer = members.find((member) => member.userId === payerId);
  return payer ? expensesCopy.paidBy(payer.email) : expensesCopy.paidByMember;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
