import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LocalVideoPlayer } from "@/components/project/LocalVideoPlayer";
import { mockReadyProject } from "@clipwise/shared";

const candidate = mockReadyProject.candidates[0];

describe("LocalVideoPlayer", () => {
  it("浏览器中断播放请求时不会抛出未处理错误", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const catchPlayError = vi.fn();
    const interruptedPlay = vi.spyOn(HTMLMediaElement.prototype, "play");
    interruptedPlay.mockReturnValueOnce({
      catch: catchPlayError,
    } as unknown as Promise<void>);

    render(
      <LocalVideoPlayer
        candidate={candidate}
        file={new File(["video"], "直播.mp4", { type: "video/mp4" })}
        onFileChange={vi.fn()}
        onPreviewStatusChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "播放该片段" }));

    expect(interruptedPlay).toHaveBeenCalledOnce();
    expect(catchPlayError).toHaveBeenCalledOnce();
  });

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
