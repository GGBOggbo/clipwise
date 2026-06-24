import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectStateView } from "@/components/project/ProjectStateView";

describe("ProjectStateView", () => {
  it("分析状态不暴露技术名词", () => {
    render(<ProjectStateView status="transcribing" />);

    expect(screen.getByText("正在识别语音")).toBeVisible();
    expect(screen.queryByText("ASR")).not.toBeInTheDocument();
  });

  it("过期状态只提供新建项目", () => {
    render(<ProjectStateView status="expired" />);

    expect(screen.getByText("项目已过期")).toBeVisible();
    expect(screen.getByRole("link", { name: "新建项目" })).toBeVisible();
  });

  it("失败状态点击重试会触发重新生成", async () => {
    const onRetry = vi.fn();
    render(<ProjectStateView status="failed" onRetry={onRetry} />);

    await userEvent.click(
      screen.getByRole("button", { name: "从失败阶段重试" }),
    );

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("失败状态展示不可恢复提示", () => {
    render(
      <ProjectStateView
        status="failed"
        retryError="可恢复的音频或转写文本已不存在，请重新上传视频。"
      />,
    );

    expect(
      screen.getByText("可恢复的音频或转写文本已不存在，请重新上传视频。"),
    ).toBeVisible();
  });
});
