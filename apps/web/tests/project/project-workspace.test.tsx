import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopViewportGuard } from "@/components/layout/DesktopViewportGuard";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockReadyProject, type ClipwiseProject } from "@clipwise/shared";

describe("ProjectWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("显示五阶段进度和候选区域", () => {
    render(<ProjectWorkspace initialProject={mockReadyProject} />);

    expect(screen.getByText("选择回放")).toBeVisible();
    expect(screen.getByText("分析内容")).toBeVisible();
    expect(screen.getByText("生成候选")).toBeVisible();
    expect(screen.getByText("预览确认")).toBeVisible();
    expect(screen.getByText("导出素材")).toBeVisible();
    expect(screen.getByRole("heading", { name: "候选片段" })).toBeVisible();
  });

  it("为窄屏设备提供桌面端提示", () => {
    render(
      <DesktopViewportGuard>
        <ProjectWorkspace initialProject={mockReadyProject} />
      </DesktopViewportGuard>,
    );

    expect(
      screen.getByText("请使用桌面端 Chrome / Edge"),
    ).toBeInTheDocument();
  });

  it("失败项目没有可恢复中间产物时展示重新上传提示", async () => {
    const failedProject: ClipwiseProject = {
      ...mockReadyProject,
      token: "failed-project",
      status: "failed",
      candidates: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: "retry_not_available",
          retryFrom: "upload",
          message: "可恢复的音频或转写文本已不存在，请重新上传视频。",
        }),
      })),
    );

    render(<ProjectWorkspace initialProject={failedProject} />);

    await userEvent.click(
      screen.getByRole("button", { name: "从失败阶段重试" }),
    );

    expect(
      await screen.findByText(
        "可恢复的音频或转写文本已不存在，请重新上传视频。",
      ),
    ).toBeVisible();
  });
});
