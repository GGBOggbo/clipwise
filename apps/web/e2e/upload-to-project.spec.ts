import { expect, test } from "@playwright/test";

test("选择 MP4 后进入演示项目", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("选择本地 MP4 回放").setInputFiles({
    name: "直播回放.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });

  await expect(page.getByText("直播回放.mp4")).toBeVisible();
  await page.getByRole("button", { name: "开始分析" }).click();
  await expect(page).toHaveURL(/\/project\/demo-project$/);
  await expect(page.getByRole("heading", { name: "候选片段" })).toBeVisible();
});
