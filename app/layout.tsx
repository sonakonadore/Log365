import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Log365 · 나의 다이어리",
  description: "일정과 일과, 월간·연간 목표를 담는 개인 다이어리",
  applicationName: "Log365",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Log365" },
  icons: {
    icon: [
      { url: "/diary.svg", type: "image/svg+xml" },
      { url: "/diary-home.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/diary-home.png", sizes: "192x192" }],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
