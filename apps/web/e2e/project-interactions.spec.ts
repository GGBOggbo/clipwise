import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/project/demo-project");
});

test("候选选择、编辑、导出提醒和列表操作", async ({ page }) => {
  await page
    .getByRole("button", {
      name: "选择片段：为什么很多人做 AI 应用第一步就错了",
    })
    .click();

  await expect(page.getByText("尚未预览")).toHaveCount(1);
  await expect(page.getByLabel("标题 1")).toBeVisible();
  await page.getByLabel("标题 1").fill("新的发布标题");
  await expect(page.getByText("等待保存")).toBeVisible();

  await page.getByRole("button", { name: "字幕" }).click();
  await page.getByLabel("字幕 1").fill("修改后的字幕");
  await expect(page.getByLabel("字幕 1")).toHaveValue("修改后的字幕");

  await page.getByLabel("重新选择本地原视频").setInputFiles({
    name: "直播回放.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });
  await page.getByRole("button", { name: "导出" }).click();
  await page.getByRole("button", { name: "快速导出当前片段" }).click();
  await expect(
    page.getByText("建议先预览片段，确认开头和结尾没有问题。"),
  ).toBeVisible();

  await page.getByRole("button", { name: "按时间顺序" }).click();
  await expect(
    page.getByRole("button", { name: "按时间顺序" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "查看更多候选" }).click();
  await expect(page.getByTestId("candidate-card")).toHaveCount(7);
});

test("桌面浏览器 720px 高度下编辑区使用确定的网格布局", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1470, height: 720 });
  await page.goto("/project/demo-project");

  await page
    .getByRole("button", {
      name: "选择片段：为什么很多人做 AI 应用第一步就错了",
    })
    .click();

  const layout = await page.evaluate(() => {
    const tabs = document.querySelector('nav[aria-label="片段编辑"]');
    const content = tabs?.nextElementSibling;
    const player = document.querySelector('[data-testid="local-video-player"]');
    const leftPanel = player?.parentElement;

    return {
      layoutMode: leftPanel ? getComputedStyle(leftPanel).display : "",
      contentHeight: content?.getBoundingClientRect().height ?? 0,
      contentTop: content?.getBoundingClientRect().top ?? 0,
      playerHeight: player?.getBoundingClientRect().height ?? 0,
    };
  });

  expect(layout.layoutMode).toBe("grid");
  expect(layout.contentHeight).toBeGreaterThan(230);
  expect(layout.contentTop).toBeLessThan(490);
  expect(layout.playerHeight).toBeGreaterThanOrEqual(280);
});
