import type { Metadata } from "next";
import { DesktopViewportGuard } from "@/components/layout/DesktopViewportGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clipwise — 直播回放智能切片",
  description: "从知识直播回放中发现并导出高价值片段。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <DesktopViewportGuard>{children}</DesktopViewportGuard>
      </body>
    </html>
  );
}
