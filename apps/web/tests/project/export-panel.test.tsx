import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockReadyProject } from "@clipwise/shared";

// mock ffmpeg 切片：返回假 mp4，不加载真实 wasm
vi.mock("@/lib/ffmpeg", () => ({
  sliceVideoClip: vi.fn(
    async () => new Blob([new Uint8Array([1])], { type: "video/mp4" }),
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function selectFirstCandidateAndUpload(
  user: ReturnType<typeof userEvent.setup>,
) {
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
}

describe("导出面板", () => {
  it("未预览时点击导出显示建议提醒", async () => {
    const user = userEvent.setup();
    await selectFirstCandidateAndUpload(user);
    await user.click(
      screen.getByRole("button", { name: "快速导出当前片段" }),
    );

    expect(
      screen.getByText("建议先预览片段，确认开头和结尾没有问题。"),
    ).toBeVisible();
  });

  it("确认后真实切片并提示导出完成", async () => {
    const user = userEvent.setup();
    await selectFirstCandidateAndUpload(user);
    await user.click(
      screen.getByRole("button", { name: "快速导出当前片段" }),
    );
    await user.click(screen.getByRole("button", { name: "继续导出" }));

    // 切片是异步的，等待完成提示出现
    expect(await screen.findByText("导出完成，请检查浏览器下载。")).toBeVisible();
    // 占位文案已移除
    expect(
      screen.queryByText("真实文件导出将在第三阶段接通。"),
    ).not.toBeInTheDocument();
  });
});
