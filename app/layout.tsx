import type { Metadata, Viewport } from "next";
import { Zen_Maru_Gothic, Geist_Mono } from "next/font/google";
import "./globals.css";

// 丸ゴシック（温かさ・手触り）。日本語込み。
const zen = Zen_Maru_Gothic({
  variable: "--font-zen",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Task Breaker — 今日はここまで、と決められるアプリ",
  description:
    "課題をAIがタスクに分解。今日の合格ラインを先に決めて、集中し、納得して終わる。ネムがそばで見守る、徹夜を防ぐタスク管理アプリ。",
};

export const viewport: Viewport = {
  themeColor: "#f4eee0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${zen.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
