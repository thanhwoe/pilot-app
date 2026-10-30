/** The sign-in UI text. Tests check these exact strings. */
export const copy = {
  emailHeading: "Đăng nhập",
  sendCode: "Gửi mã",
  codePrompt: (email: string) => `Nhập mã 6 số đã gửi tới ${email}`,
  signIn: "Đăng nhập",
  useAnotherEmail: "Dùng email khác",
  signedInAs: (email: string) => `Đã đăng nhập: ${email}`,
  signOut: "Đăng xuất",
  wrongCode: "Mã không đúng hoặc đã hết hạn. Hãy thử lại hoặc yêu cầu mã mới.",
  invalidEmail: "Email không hợp lệ.",
  codeFormat: "Mã gồm 6 chữ số.",
  tooManyRequests: "Bạn đã yêu cầu quá nhiều mã. Hãy thử lại sau 15 phút.",
  unavailable: "Không kết nối được máy chủ. Hãy thử lại.",
} as const;
