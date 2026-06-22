# Clipwise 上传拖拽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为上传页增加可点击、可键盘操作的 MP4 拖拽区，并复用现有文件校验和分析流程。

**Architecture:** 在 `UploadPageClient` 中增加 `isDragging` 状态和拖拽事件处理；点击选择与拖拽放下都调用现有 `chooseFile`，保证验证规则只有一份。视觉状态由 CSS Module 类名控制，不引入新依赖或新组件。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS Modules、Vitest、Testing Library。

---

### Task 1: 增加拖拽行为测试

**Files:**
- Modify: `apps/web/tests/upload/upload-page.test.tsx`

- [ ] **Step 1: 写有效文件拖入测试**

使用 `fireEvent.drop` 向名为 `上传 MP4 回放` 的按钮拖入 MP4，并断言文件名与“开始分析”出现。

- [ ] **Step 2: 写拖入状态与无效文件测试**

使用 `fireEvent.dragEnter` 断言出现“松开即可选择”；使用 `fireEvent.drop` 拖入文本文件，断言现有格式错误出现。

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @clipwise/web exec vitest run tests/upload/upload-page.test.tsx`

Expected: FAIL，因为拖拽按钮和对应事件尚未实现。

### Task 2: 实现拖拽上传区

**Files:**
- Modify: `apps/web/components/upload/UploadPageClient.tsx`
- Modify: `apps/web/components/upload/UploadPage.module.css`

- [ ] **Step 1: 增加拖拽状态**

在 `UploadPageClient` 中加入：

```tsx
const [isDragging, setIsDragging] = useState(false);
```

- [ ] **Step 2: 增加拖拽区**

用 `button` 包裹默认文案，点击时触发隐藏文件输入；处理 `dragEnter`、`dragOver`、`dragLeave` 和 `drop`。`drop` 时只读取 `event.dataTransfer.files[0]` 并调用 `chooseFile`。

- [ ] **Step 3: 增加视觉样式**

新增 `.dropZone`、`.dropZoneActive`、`.dropIcon` 和辅助文案样式。默认使用虚线边框，拖入时使用蓝色边框与浅蓝背景；不修改页面整体布局。

- [ ] **Step 4: 运行组件测试**

Run: `pnpm --filter @clipwise/web exec vitest run tests/upload/upload-page.test.tsx`

Expected: PASS。

### Task 3: 回归验证与提交

**Files:**
- Modify: `docs/phase-1-verification.md`

- [ ] **Step 1: 补充验收记录**

增加“上传页拖拽 MP4、拖入高亮和无效格式提示：通过”。

- [ ] **Step 2: 运行完整验证**

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
git diff --check
```

Expected: 全部退出码为 0。

- [ ] **Step 3: 浏览器检查**

在 `http://localhost:3000/` 检查默认拖拽区、拖入高亮、文件选择后状态和页面控制台。

- [ ] **Step 4: 提交**

```bash
git add apps/web docs/phase-1-verification.md
git commit -m "feat: add drag and drop video selection"
```
