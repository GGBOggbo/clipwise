import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockReadyProject } from "@clipwise/shared";

describe("导出面板", () => {
  it("未预览时点击导出显示建议提醒", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);

    await user.click(
      screen.getByRole("button", {
        name: "选择片段：为什么很多人做 AI 应用第一步就错了",
      }),
    );
    await user.upload(
      screen.getByLabelText("重新选择本地原视频"),
      new File(["video"], "直播.mp4", { type: "video/mp4" }),
    );
    await user.click(screen.getByRole("button", { name: "导出" }));
    await user.click(
      screen.getByRole("button", { name: "快速导出当前片段" }),
    );

    expect(
      screen.getByText("建议先预览片段，确认开头和结尾没有问题。"),
    ).toBeVisible();
  });

  it("继续导出不会伪造下载完成", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);

    await user.click(
      screen.getByRole("button", {
        name: "选择片段：为什么很多人做 AI 应用第一步就错了",
      }),
    );
    await user.upload(
      screen.getByLabelText("重新选择本地原视频"),
      new File(["video"], "直播.mp4", { type: "video/mp4" }),
    );
    await user.click(screen.getByRole("button", { name: "导出" }));
    await user.click(
      screen.getByRole("button", { name: "快速导出当前片段" }),
    );
    await user.click(screen.getByRole("button", { name: "继续导出" }));

    expect(
      screen.getByText("真实文件导出将在第三阶段接通。"),
    ).toBeVisible();
    expect(screen.queryByText("导出完成")).not.toBeInTheDocument();
  });
});
