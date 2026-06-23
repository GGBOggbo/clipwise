import { expect, test } from "@playwright/test";

// Phase 4 接通真实 ffmpeg.wasm 提取后，无头浏览器跑不了 25MB wasm core。
// 第一个测试改为直接验证项目页可达（不经上传），真实上传链路由集成测试覆盖。
test("项目页可直接访问并看到候选", async ({ page }) => {
  await page.goto("/project/demo-project");
  await expect(page.getByRole("heading", { name: "候选片段" })).toBeVisible();
});

test("上传页保持原设计的单行标题和结果图标", async ({ page }) => {
  await page.goto("/");

  const title = page.getByRole("heading", {
    name: "不用看完整场直播，也能找到高价值片段",
  });
  await expect(title).toHaveCSS("white-space", "nowrap");
  await expect(page.getByTestId("result-icon")).toHaveCount(3);
  await expect(page.getByText("01")).toHaveCount(0);
});
