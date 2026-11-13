import { describe, expect, it } from "vitest";
import { expensesCopy, groupsCopy, invitesCopy } from "./copy";

// #21 A2: the web and the mobile app show the same loading and retry text.
describe("groupsCopy", () => {
  it("has the loading line and the retry button text", () => {
    expect(groupsCopy.loading).toBe("Đang tải nhóm…");
    expect(groupsCopy.retry).toBe("Thử lại");
  });
});

// #94: the invite text, as the author wrote it on the issue. The web and the mobile app share it.
describe("invitesCopy", () => {
  it("#94 AC 1, 8: has the button text for a group with and without a link", () => {
    expect(invitesCopy.invite).toBe("Mời thành viên");
    expect(invitesCopy.newLink).toBe("Tạo liên kết mới");
  });

  it("#94 AC 8: says the link is shown once and that making another ends the old one", () => {
    expect(invitesCopy.shownOnce).toBe(
      "Liên kết này chỉ hiện một lần. Nếu cần lại, hãy tạo liên kết mới. Liên kết cũ sẽ không dùng được nữa.",
    );
  });

  it("#94 AC 1: has the copy button text before and after copying", () => {
    expect(invitesCopy.copy).toBe("Sao chép");
    expect(invitesCopy.copied).toBe("Đã sao chép");
  });

  it("#94 AC 2: has the invite page heading and the join button", () => {
    expect(invitesCopy.heading("Đà Lạt")).toBe("Bạn được mời vào nhóm “Đà Lạt”");
    expect(invitesCopy.join).toBe("Tham gia nhóm");
  });

  it("#94 AC 5: has one message for every bad link, which says nothing about why", () => {
    expect(invitesCopy.badLink).toBe(
      "Liên kết mời này không dùng được. Hãy xin người mời bạn một liên kết mới.",
    );
  });
});

// #97: the expense text. The plan's table, with the author's change to the payer fallback.
describe("expensesCopy", () => {
  it("#97 AC 3, 4: has the add button, the field labels and the save button", () => {
    expect(expensesCopy.add).toBe("Thêm chi tiêu");
    expect(expensesCopy.amountLabel).toBe("Số tiền");
    expect(expensesCopy.descriptionLabel).toBe("Mô tả");
    expect(expensesCopy.save).toBe("Lưu");
  });

  it("#97 AC 3: has the empty state and the loading line", () => {
    expect(expensesCopy.empty).toBe("Nhóm này chưa có chi tiêu nào.");
    expect(expensesCopy.loading).toBe("Đang tải chi tiêu…");
  });

  it("#97 AC 2: says who paid", () => {
    expect(expensesCopy.paidByMe).toBe("Bạn đã trả");
    expect(expensesCopy.paidBy("bao@example.com")).toBe("bao@example.com đã trả");
    expect(expensesCopy.paidByMember).toBe("Một thành viên đã trả");
  });

  it("#97 AC 6: has one message for each way the form can be wrong", () => {
    expect(expensesCopy.amountRequired).toBe("Hãy nhập số tiền.");
    expect(expensesCopy.amountTooLarge).toBe("Số tiền tối đa là 100.000.000 ₫.");
    expect(expensesCopy.descriptionRequired).toBe("Hãy nhập mô tả.");
  });

  it("#97 AC 7: reuses the groups' connection error and retry button", () => {
    expect(expensesCopy.unavailable).toBe(groupsCopy.unavailable);
    expect(expensesCopy.retry).toBe(groupsCopy.retry);
  });
});
