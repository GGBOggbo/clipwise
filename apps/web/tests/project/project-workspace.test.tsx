import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockReadyProject } from "@clipwise/shared";

describe("ProjectWorkspace", () => {
  it("显示五阶段进度和候选区域", () => {
    render(<ProjectWorkspace initialProject={mockReadyProject} />);

    expect(screen.getByText("选择回放")).toBeVisible();
    expect(screen.getByText("分析内容")).toBeVisible();
    expect(screen.getByText("生成候选")).toBeVisible();
    expect(screen.getByText("预览确认")).toBeVisible();
    expect(screen.getByText("导出素材")).toBeVisible();
    expect(screen.getByRole("heading", { name: "候选片段" })).toBeVisible();
  });
});
