import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/project/demo-project");
});

// Phase 3 接通真实 PATCH 后，编辑会真写 DB（autosave → patchCandidate）。
// 测试结尾用 afterEach 恢复 candidate-1 的原始标题，避免污染后续测试。
const ORIGINAL_TITLE = "为什么很多人做 AI 应用第一步就错了";
const selectFirstCandidate = async (page: import("@playwright/test").Page) => {
  await page
    .getByTestId("candidate-card")
    .first()
    .getByRole("button", { name: /^选择片段：/ })
    .click();
};

test.afterEach(async () => {
  // 用 fetch 直接 PATCH 恢复，绕过 UI
  const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  await fetch(`${base}/api/projects/demo-project/candidates/candidate-1`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selectedTitle: ORIGINAL_TITLE,
      titleOptions: [
        ORIGINAL_TITLE,
        "AI 应用失败，往往不是模型问题",
        "做 AI 产品前，先问清楚这个问题",
      ],
    }),
  }).catch(() => {});
});

test("候选选择、编辑、导出提醒和列表操作", async ({ page }) => {
  await selectFirstCandidate(page);

  await expect(page.getByText("尚未预览")).toHaveCount(1);
  await expect(page.getByLabel("标题 1")).toBeVisible();
  await page.getByLabel("标题 1").fill("新的发布标题");
  await expect(page.getByText("等待保存")).toBeVisible();
  await expect(page.getByText("已保存")).toBeVisible();

  await page.getByRole("button", { name: "字幕" }).click();
  await page.getByLabel("字幕 1").fill("修改后的字幕");
  await expect(page.getByLabel("字幕 1")).toHaveValue("修改后的字幕");
  await expect(page.getByText("已保存")).toBeVisible();

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

  await selectFirstCandidate(page);
  await page.getByLabel("重新选择本地原视频").setInputFiles({
    name: "直播回放.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("demo-video"),
  });

  const layout = await page.evaluate(() => {
    const tabs = document.querySelector('nav[aria-label="片段编辑"]');
    const content = tabs?.nextElementSibling;
    const player = document.querySelector('[data-testid="local-video-player"]');
    const video = document.querySelector('[data-testid="local-video"]');
    const leftPanel = player?.parentElement;

    if (video instanceof HTMLElement) {
      video.style.aspectRatio = "16 / 9";
    }

    const playerRect = player?.getBoundingClientRect();
    const videoRect = video?.getBoundingClientRect();

    return {
      layoutMode: leftPanel ? getComputedStyle(leftPanel).display : "",
      contentHeight: content?.getBoundingClientRect().height ?? 0,
      contentTop: content?.getBoundingClientRect().top ?? 0,
      playerHeight: playerRect?.height ?? 0,
      videoHeight: videoRect?.height ?? 0,
    };
  });

  expect(layout.layoutMode).toBe("grid");
  expect(layout.contentHeight).toBeGreaterThan(230);
  expect(layout.contentTop).toBeLessThan(490);
  expect(layout.playerHeight).toBeGreaterThanOrEqual(280);
  expect(layout.videoHeight).toBeLessThanOrEqual(layout.playerHeight);
});
