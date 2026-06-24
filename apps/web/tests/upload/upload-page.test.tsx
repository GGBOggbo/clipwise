import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadPageClient } from "@/components/upload/UploadPageClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("UploadPageClient", () => {
  it("选择文件前只显示一个文件选择入口", () => {
    render(<UploadPageClient />);

    expect(
      screen.getByRole("heading", {
        name: "不用看完整场直播，也能找到高价值片段",
      }).className,
    ).toContain("heroTitle");
    expect(
      screen.getByRole("button", { name: "上传 MP4 回放" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "选择回放" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "开始分析" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("选择回放")).toBeVisible();
    expect(screen.getByText("分析内容")).toBeVisible();
    expect(screen.getByText("生成候选")).toBeVisible();
    expect(screen.getByText("预览确认")).toBeVisible();
    expect(screen.getByText("导出素材")).toBeVisible();
  });

  it("选择有效文件后显示独立的开始分析按钮", async () => {
    const user = userEvent.setup();
    render(<UploadPageClient />);

    const input = screen.getByLabelText("选择本地 MP4 回放");
    await user.upload(
      input,
      new File(["video"], "直播.mp4", { type: "video/mp4" }),
    );

    expect(screen.getByText("直播.mp4")).toBeVisible();
    expect(screen.getByText("点击或拖入新文件替换")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "重新选择" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeEnabled();
  });

  it("拖入有效 MP4 后显示文件信息和开始分析按钮", () => {
    render(<UploadPageClient />);

    fireEvent.drop(screen.getByRole("button", { name: "上传 MP4 回放" }), {
      dataTransfer: {
        files: [new File(["video"], "拖拽直播.mp4", { type: "video/mp4" })],
      },
    });

    expect(screen.getByText("拖拽直播.mp4")).toBeVisible();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeEnabled();
  });

  it("拖入文件时提示松开即可选择", () => {
    render(<UploadPageClient />);

    fireEvent.dragEnter(
      screen.getByRole("button", { name: "上传 MP4 回放" }),
    );

    expect(screen.getByText("松开即可选择")).toBeVisible();
  });

  it("拖入非 MP4 文件时显示格式错误", () => {
    render(<UploadPageClient />);

    fireEvent.drop(screen.getByRole("button", { name: "上传 MP4 回放" }), {
      dataTransfer: {
        files: [new File(["text"], "笔记.txt", { type: "text/plain" })],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("MP4");
  });

  it("结果卡片使用原设计图标而不是数字编号", () => {
    render(<UploadPageClient />);

    expect(screen.getAllByTestId("result-icon")).toHaveLength(3);
    expect(screen.queryByText("01")).not.toBeInTheDocument();
    expect(screen.queryByText("02")).not.toBeInTheDocument();
    expect(screen.queryByText("03")).not.toBeInTheDocument();
  });
});
