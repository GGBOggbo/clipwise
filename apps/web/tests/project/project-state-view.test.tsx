import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectStateView } from "@/components/project/ProjectStateView";

describe("ProjectStateView", () => {
  it("分析状态不暴露技术名词", () => {
    render(<ProjectStateView status="transcribing" />);

    expect(screen.getByText("正在识别语音")).toBeVisible();
    expect(screen.queryByText("ASR")).not.toBeInTheDocument();
  });

  it("过期状态只提供新建项目", () => {
    render(<ProjectStateView status="expired" />);

    expect(screen.getByText("项目已过期")).toBeVisible();
    expect(screen.getByRole("link", { name: "新建项目" })).toBeVisible();
  });
});
