import { render, screen } from "@testing-library/react";
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
});
