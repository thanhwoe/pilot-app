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
} as const;
