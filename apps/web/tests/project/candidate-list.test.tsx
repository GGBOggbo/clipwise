import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockReadyProject } from "@clipwise/shared";

describe("候选选择", () => {
  it("点击候选只选中，不标记为已预览", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);

    await user.click(
      screen.getByRole("button", {
        name: "选择片段：为什么很多人做 AI 应用第一步就错了",
      }),
    );

    expect(screen.getAllByText("尚未预览").length).toBeGreaterThan(0);
    expect(screen.queryByText("已预览")).not.toBeInTheDocument();
  });

  it("默认显示 5 个候选，可查看更多", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);

    expect(screen.getAllByTestId("candidate-card")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "查看更多候选" }));
    expect(screen.getAllByTestId("candidate-card")).toHaveLength(7);
  });

  it("可按时间顺序排序", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);

    await user.click(screen.getByRole("button", { name: "按时间顺序" }));
    expect(screen.getAllByTestId("candidate-time")[0]).toHaveTextContent(
      "13:20",
    );
  });
});
