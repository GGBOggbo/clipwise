import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadPageClient } from "@/components/upload/UploadPageClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("UploadPageClient", () => {
  it("选择文件前只显示选择按钮", () => {
    render(<UploadPageClient />);

    expect(screen.getByRole("button", { name: "选择回放" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "开始分析" }),
    ).not.toBeInTheDocument();
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
});
