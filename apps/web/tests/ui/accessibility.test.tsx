import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { UploadPageClient } from "@/components/upload/UploadPageClient";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockReadyProject } from "@clipwise/shared";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const axeOptions = {
  rules: {
    "color-contrast": { enabled: false },
  },
};

describe("基础无障碍", () => {
  it("上传页没有可检测到的严重问题", async () => {
    const { container } = render(<UploadPageClient />);

    expect((await axe(container, axeOptions)).violations).toEqual([]);
  });

  it("项目页没有可检测到的严重问题", async () => {
    const { container } = render(
      <ProjectWorkspace initialProject={mockReadyProject} />,
    );

    expect((await axe(container, axeOptions)).violations).toEqual([]);
  });
});
