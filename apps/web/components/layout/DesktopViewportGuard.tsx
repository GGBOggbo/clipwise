import type { ReactNode } from "react";

type DesktopViewportGuardProps = {
  children: ReactNode;
};

export function DesktopViewportGuard({
  children,
}: DesktopViewportGuardProps) {
  return (
    <>
      <section className="desktop-viewport-notice" aria-live="polite">
        <div>
          <span aria-hidden="true">Clipwise</span>
          <h1>请使用桌面端 Chrome / Edge</h1>
          <p>视频预览和导出需要更大的屏幕，窗口宽度至少为 900px。</p>
        </div>
      </section>
      <div className="desktop-viewport-content">{children}</div>
    </>
  );
}
