"use client";

import { useState, type ReactNode } from "react";

type DesktopViewportGuardProps = {
  children: ReactNode;
};

export function DesktopViewportGuard({
  children,
}: DesktopViewportGuardProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板可能被浏览器拒绝，静默失败（用户可手动复制地址栏）
    }
  }

  return (
    <>
      <section className="desktop-viewport-notice" aria-live="polite">
        <div>
          <span aria-hidden="true">Clipwise</span>
          <h1>请在电脑上打开</h1>
          <p>
            视频处理和导出需要桌面端 Chrome / Edge（宽度至少 900px）。
            复制下面的链接，到电脑浏览器打开即可。
          </p>
          <button
            type="button"
            className="desktop-viewport-copy"
            onClick={copyLink}
          >
            {copied ? "已复制链接" : "复制链接到电脑"}
          </button>
        </div>
      </section>
      <div className="desktop-viewport-content">{children}</div>
    </>
  );
}
