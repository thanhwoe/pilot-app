import { signInCopy } from "../sign-in/copy";

/** The groups UI text for web and mobile. Tests check these exact strings. */
export const groupsCopy = {
  heading: "Nhóm của tôi",
  empty: "Bạn chưa có nhóm nào.",
  nameLabel: "Tên nhóm",
  create: "Tạo nhóm",
  nameRequired: "Hãy nhập tên nhóm.",
  memberCount: (count: number) => `${count} thành viên`,
  unavailable: signInCopy.unavailable,
  loading: "Đang tải nhóm…",
  retry: "Thử lại",
} as const;

/** The invite UI text for web and mobile (#94). Tests check these exact strings. */
export const invitesCopy = {
  invite: "Mời thành viên",
  /** The button once the group has a link: pressing it ends the old one. */
  newLink: "Tạo liên kết mới",
  linkLabel: "Liên kết mời",
  shownOnce:
    "Liên kết này chỉ hiện một lần. Nếu cần lại, hãy tạo liên kết mới. Liên kết cũ sẽ không dùng được nữa.",
  copy: "Sao chép",
  copied: "Đã sao chép",
  heading: (groupName: string) => `Bạn được mời vào nhóm “${groupName}”`,
  join: "Tham gia nhóm",
  /** One message for every link that doesn't work, so it says nothing about why. */
  badLink: "Liên kết mời này không dùng được. Hãy xin người mời bạn một liên kết mới.",
} as const;
