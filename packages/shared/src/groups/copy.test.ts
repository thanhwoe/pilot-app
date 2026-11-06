import { describe, expect, it } from "vitest";
import { groupsCopy, invitesCopy } from "./copy";

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
