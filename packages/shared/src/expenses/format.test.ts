import { describe, expect, it } from "vitest";
import {
  formatAmountInput,
  formatExpenseDate,
  formatVnd,
  parseAmountInput,
  payerLine,
} from "./format";

describe("formatVnd", () => {
  it("#97 AC 2: shows whole VND with a dot between groups of three and the ₫ sign", () => {
    expect(formatVnd(1)).toBe("1 ₫");
    expect(formatVnd(1000)).toBe("1.000 ₫");
    expect(formatVnd(90000)).toBe("90.000 ₫");
    expect(formatVnd(100_000_000)).toBe("100.000.000 ₫");
  });
});

describe("formatAmountInput", () => {
  it("#97 AC 5: keeps digits only, with a dot between groups of three", () => {
    expect(formatAmountInput("12a3,4.5")).toBe("12.345");
    expect(formatAmountInput("90000")).toBe("90.000");
    expect(formatAmountInput("")).toBe("");
    expect(formatAmountInput("abc")).toBe("");
  });

  it("#97 AC 5: keeps the first nine digits, so the field cannot pass 999.999.999", () => {
    expect(formatAmountInput("1234567890")).toBe("123.456.789");
  });

  it("#97 AC 5: takes a pasted amount with its dots and sign", () => {
    expect(formatAmountInput("1.234.567 ₫")).toBe("1.234.567");
  });

  it("#97 AC 5: drops leading zeros but keeps a single zero", () => {
    expect(formatAmountInput("0007")).toBe("7");
    expect(formatAmountInput("0")).toBe("0");
    expect(formatAmountInput("000")).toBe("0");
  });
});

describe("parseAmountInput", () => {
  it("#97 AC 5, 6: gives the whole number, and 0 for an empty field", () => {
    expect(parseAmountInput("12.345")).toBe(12345);
    expect(parseAmountInput("")).toBe(0);
    expect(parseAmountInput("0")).toBe(0);
  });
});

describe("formatExpenseDate", () => {
  it("#97 AC 2: shows dd/MM/yyyy in the given UTC offset", () => {
    expect(formatExpenseDate("2026-11-13T17:30:00Z", 420)).toBe("14/11/2026");
    expect(formatExpenseDate("2026-11-13T17:30:00Z", 0)).toBe("13/11/2026");
    expect(formatExpenseDate("2026-11-13T02:00:00Z", -300)).toBe("12/11/2026");
  });

  it("pads a day and a month under 10", () => {
    expect(formatExpenseDate("2026-03-05T10:00:00Z", 0)).toBe("05/03/2026");
  });
});

describe("payerLine", () => {
  const me = "6f1c1d2e-8b7a-4c3d-9e0f-1a2b3c4d5e6f";
  const bao = "0b6f8f5e-7a63-4f1f-9d1e-2f4c1a3b5c6d";
  const members = [
    { userId: me, email: "an@example.com" },
    { userId: bao, email: "bao@example.com" },
  ];

  it("#97 AC 2: says Bạn đã trả when I paid", () => {
    expect(payerLine(me, me, members)).toBe("Bạn đã trả");
  });

  it("#97 AC 2: says the payer's email when another member paid", () => {
    expect(payerLine(bao, me, members)).toBe("bao@example.com đã trả");
  });

  it("says a member paid when the payer is not among the members", () => {
    expect(payerLine("3d9e0f1a-2b3c-4d5e-8f6a-7b8c9d0e1f2a", me, members)).toBe(
      "Một thành viên đã trả",
    );
  });
});
