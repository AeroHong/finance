import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/app/providers";

export const metadata: Metadata = {
  title: "BTC 매매일지",
  description: "BTC 선물 트레이딩 매매일지",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
