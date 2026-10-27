import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeowMemo - Listen closer",
  description: "A private, AI-assisted journal for your cat's vocal moments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
