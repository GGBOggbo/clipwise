import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocalVideoPlayer } from "@/components/project/LocalVideoPlayer";
import { mockReadyProject } from "@clipwise/shared";

const candidate = mockReadyProject.candidates[0];

describe("LocalVideoPlayer", () => {
  it("没有本地视频时显示重新选择入口", () => {
    render(
      <LocalVideoPlayer
        candidate={candidate}
        file={null}
        onFileChange={vi.fn()}
        onPreviewStatusChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "重新选择原视频" }),
    ).toBeVisible();
  });

  it("选择文件后显示真实 video 元素", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LocalVideoPlayer
        candidate={candidate}
        file={null}
        onFileChange={vi.fn()}
        onPreviewStatusChange={vi.fn()}
      />,
    );

    await user.upload(
      screen.getByLabelText("重新选择本地原视频"),
      new File(["video"], "直播.mp4", { type: "video/mp4" }),
    );

    rerender(
      <LocalVideoPlayer
        candidate={candidate}
        file={new File(["video"], "直播.mp4", { type: "video/mp4" })}
        onFileChange={vi.fn()}
        onPreviewStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("local-video")).toBeInTheDocument();
  });
});
