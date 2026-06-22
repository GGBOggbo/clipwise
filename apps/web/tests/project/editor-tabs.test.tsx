import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockReadyProject } from "@clipwise/shared";

async function selectFirstCandidate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", {
      name: "选择片段：为什么很多人做 AI 应用第一步就错了",
    }),
  );
}

describe("片段编辑器", () => {
  it("选中候选后可编辑标题并显示保存状态", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);
    await selectFirstCandidate(user);

    const title = screen.getByLabelText("标题 1");
    await user.clear(title);
    await user.type(title, "新的发布标题");

    expect(title).toHaveValue("新的发布标题");
    expect(screen.getByText("等待保存")).toBeVisible();
  });

  it("字幕时间码只读，字幕文本可编辑", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);
    await selectFirstCandidate(user);
    await user.click(screen.getByRole("button", { name: "字幕" }));

    expect(screen.getByText("13:20 – 13:25")).toBeVisible();
    const subtitle = screen.getByLabelText("字幕 1");
    await user.clear(subtitle);
    await user.type(subtitle, "修改后的字幕");
    expect(subtitle).toHaveValue("修改后的字幕");
  });
});
