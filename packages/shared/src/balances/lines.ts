import type { MemberBalance, SuggestedPayment } from "../balances";
import { formatVnd } from "../expenses/format";
import { balancesCopy } from "../groups/copy";

type Member = { userId: string; email: string };

/** `50000` as `+50.000 ₫`, `-50000` as `−50.000 ₫` (U+2212), `0` as `0 ₫`. Whole VND. */
export function formatSignedVnd(amount: number): string {
  if (amount > 0) {
    return `+${formatVnd(amount)}`;
  }
  if (amount < 0) {
    return `−${formatVnd(-amount)}`;
  }
  return formatVnd(0);
}

/** "Bạn" for me, the member's email, or a fallback for a user the member list doesn't have. */
export function memberLabel(userId: string, myId: string, members: Member[]): string {
  if (userId === myId) {
    return balancesCopy.me;
  }
  return members.find((member) => member.userId === userId)?.email ?? balancesCopy.otherMember;
}

/** One row per balance, in the order the API gave them. */
export function balanceRows(balances: MemberBalance[], myId: string, members: Member[]) {
  return balances.map(({ userId, balance }) => ({
    userId,
    label: memberLabel(userId, myId, members),
    amount: formatSignedVnd(balance),
  }));
}

/** One line per suggested payment: "<email> trả Bạn 50.000 ₫". */
export function paymentLines(suggestions: SuggestedPayment[], myId: string, members: Member[]) {
  return suggestions.map(({ from, to, amount }) => ({
    from,
    to,
    text: balancesCopy.pays(
      memberLabel(from, myId, members),
      memberLabel(to, myId, members),
      formatVnd(amount),
    ),
  }));
}
