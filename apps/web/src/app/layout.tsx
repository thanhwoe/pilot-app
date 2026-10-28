import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Góp",
  description: "Split group expenses and see who owes whom.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
