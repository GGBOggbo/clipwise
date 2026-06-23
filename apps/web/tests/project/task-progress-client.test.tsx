import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskProgressClient } from "@/components/project/TaskProgressClient";

// 默认 mock useTaskProgress 返回 running 态
vi.mock("@/features/task-progress/useTaskProgress", () => ({
  useTaskProgress: vi.fn(() => ({
    status: "running",
    progress: 60,
    message: "正在分析内容",
    errorCode: null,
    isPolling: false,
  })),
}));

describe("TaskProgressClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("渲染进度条和当前阶段文案", () => {
    render(<TaskProgressClient taskId="t1" projectToken="p1" />);
    expect(screen.getByText("正在分析内容")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
  });

  it("失败状态显示重试按钮", async () => {
    const mod = await import("@/features/task-progress/useTaskProgress");
    vi.mocked(mod.useTaskProgress).mockReturnValue({
      status: "failed",
      progress: 30,
      message: "处理失败",
      errorCode: "processing_failed",
      isPolling: false,
    });
    render(<TaskProgressClient taskId="t2" projectToken="p2" />);
    expect(screen.getByText("处理失败")).toBeVisible();
    expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
  });
});
