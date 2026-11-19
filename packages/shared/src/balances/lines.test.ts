import { describe, expect, it } from "vitest";
import { balancesCopy } from "../groups/copy";
import { balanceRows, formatSignedVnd, memberLabel, paymentLines } from "./lines";

const me = "00000000-0000-4000-8000-000000000001";
const bao = "00000000-0000-4000-8000-000000000002";
const chi = "00000000-0000-4000-8000-000000000003";
const stranger = "00000000-0000-4000-8000-000000000009";
const members = [
  { userId: me, email: "me@example.com" },
  { userId: bao, email: "bao@example.com" },
  { userId: chi, email: "chi@example.com" },
];

describe("formatSignedVnd", () => {
  it("#134 AC 1, A10: signs whole VND, with U+2212 for a minus", () => {
    expect(formatSignedVnd(50000)).toBe("+50.000 ₫");
    expect(formatSignedVnd(-50000)).toBe("−50.000 ₫");
    expect(formatSignedVnd(0)).toBe("0 ₫");
    expect(formatSignedVnd(-7)).toBe("−7 ₫");
  });
});

describe("memberLabel", () => {
  it("#134 AC 1, A8: Bạn for me, the email for a member, a fallback for an unknown id", () => {
    expect(memberLabel(me, me, members)).toBe("Bạn");
    expect(memberLabel(bao, me, members)).toBe("bao@example.com");
    expect(memberLabel(stranger, me, members)).toBe("Thành viên khác");
  });
});

describe("balanceRows", () => {
  it("#134 AC 1: one row per balance, in the API's order, with a label and a signed amount", () => {
    const rows = balanceRows(
      [
        { userId: bao, balance: -50000 },
        { userId: me, balance: 50000 },
        { userId: chi, balance: 0 },
      ],
      me,
      members,
    );
    expect(rows).toEqual([
      { userId: bao, label: "bao@example.com", amount: "−50.000 ₫" },
      { userId: me, label: "Bạn", amount: "+50.000 ₫" },
      { userId: chi, label: "chi@example.com", amount: "0 ₫" },
    ]);
  });

  it("#134 A8: keeps a balance whose user is not in the member list", () => {
    const rows = balanceRows([{ userId: stranger, balance: 1000 }], me, members);
    expect(rows).toEqual([{ userId: stranger, label: "Thành viên khác", amount: "+1.000 ₫" }]);
  });
});

describe("paymentLines", () => {
  it("#134 AC 2: says who pays whom", () => {
    const lines = paymentLines(
      [
        { from: bao, to: me, amount: 50000 },
        { from: me, to: chi, amount: 20000 },
        { from: bao, to: chi, amount: 1500 },
        { from: stranger, to: me, amount: 10 },
      ],
      me,
      members,
    );
    expect(lines.map((line) => line.text)).toEqual([
      "bao@example.com trả Bạn 50.000 ₫",
      "Bạn trả chi@example.com 20.000 ₫",
      "bao@example.com trả chi@example.com 1.500 ₫",
      "Thành viên khác trả Bạn 10 ₫",
    ]);
  });
});

describe("paymentLines amounts", () => {
  it("#148: carries each line's payer, payee and amount for the Đã trả button", () => {
    const lines = paymentLines([{ from: me, to: chi, amount: 20000 }], me, members);

    expect(lines).toEqual([
      { from: me, to: chi, amount: 20000, text: "Bạn trả chi@example.com 20.000 ₫" },
    ]);
  });
});

describe("balancesCopy", () => {
  it("#134: has the section text", () => {
    expect(balancesCopy.settled).toBe("Đã cân bằng");
    expect(balancesCopy.otherMember).toBe("Thành viên khác");
    expect(balancesCopy.retry).toBe("Thử lại");
    expect(balancesCopy.pays("A", "B", "5 ₫")).toBe("A trả B 5 ₫");
  });
});
