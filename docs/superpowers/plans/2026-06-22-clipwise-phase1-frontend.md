# Clipwise 第一阶段前端闭环实施计划

> **面向执行代理：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，严格按任务逐项实施。所有步骤使用复选框跟踪。

**目标：** 建立可运行、可测试的 Clipwise 前端应用，使用模拟 Provider 跑通“选择本地视频 → 查看分析状态 → 浏览候选 → 真实预览 → 编辑文案和字幕 → 触发导出确认”的完整流程。

**架构：** 仓库根目录使用 pnpm workspace；`apps/web` 为 Next.js App Router 应用，`packages/shared` 保存跨前后端领域类型和固定演示数据。第一阶段不接 Groq、DeepSeek、Postgres 和真实 FFmpeg 导出，只建立稳定接口、真实本地播放器和生产级状态机，为后续阶段直接替换 Provider。

**技术栈：** Node.js 24、pnpm、Next.js App Router、React、TypeScript、CSS Modules、Vitest、Testing Library、Playwright。

---

## 一、文件结构

第一阶段完成后的结构：

```text
.
├── package.json
├── pnpm-workspace.yaml
├── .gitignore
├── apps/
│   └── web/
│       ├── app/
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── project/[token]/page.tsx
│       ├── components/
│       │   ├── upload/
│       │   ├── project/
│       │   └── ui/
│       ├── features/
│       │   ├── local-video/
│       │   ├── project-state/
│       │   └── autosave/
│       ├── lib/
│       │   ├── browser-capabilities.ts
│       │   ├── file-validation.ts
│       │   └── mock-project-provider.ts
│       ├── public/reference/
│       ├── tests/
│       ├── e2e/
│       ├── vitest.config.ts
│       └── playwright.config.ts
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/
│           ├── domain.ts
│           ├── fixtures.ts
│           └── index.ts
├── references/
│   ├── clipwise-index-3.html
│   ├── clipwise-project-5.html
│   ├── 直播回放智能切片工具_SPEC_v0.2.md
│   └── 直播回放智能切片工具_前端设计稿合集_v0.2.md
└── docs/
```

边界约束：

- 页面组件只负责组合，不直接实现视频算法或状态转换。
- `packages/shared` 不依赖浏览器 API。
- `features/local-video` 只处理本地文件、播放器和预览进度。
- `features/autosave` 只处理编辑状态和保存调度。
- 第一阶段所有服务端行为由 `MockProjectProvider` 提供，组件不直接读取固定 JSON。

---

### 任务 1：初始化仓库和 Next.js 应用

**文件：**

- 创建：`package.json`
- 创建：`pnpm-workspace.yaml`
- 创建：`.gitignore`
- 创建：`apps/web/**`
- 创建：`packages/shared/package.json`
- 创建：`packages/shared/src/index.ts`

- [ ] **步骤 1：初始化 Git 仓库**

运行：

```bash
git init
git branch -M main
```

预期：`git status --short --branch` 显示 `## No commits yet on main`。

- [ ] **步骤 2：使用官方脚手架创建 Next.js 应用**

运行：

```bash
pnpm create next-app@latest apps/web \
  --ts \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --use-pnpm \
  --no-tailwind \
  --yes
```

预期：生成可启动的 App Router 应用。Node.js 版本满足 Next.js 官方最低要求。

- [ ] **步骤 3：创建 workspace 根配置**

`package.json`：

```json
{
  "name": "clipwise",
  "private": true,
  "packageManager": "pnpm@10.33.2",
  "scripts": {
    "dev": "pnpm --filter @clipwise/web dev",
    "build": "pnpm --filter @clipwise/web build",
    "lint": "pnpm --filter @clipwise/web lint",
    "test": "pnpm --filter @clipwise/web test",
    "test:e2e": "pnpm --filter @clipwise/web test:e2e"
  }
}
```

`pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - packages/*
```

`packages/shared/package.json`：

```json
{
  "name": "@clipwise/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

`packages/shared/src/index.ts`：

```ts
export {};
```

- [ ] **步骤 4：配置应用依赖 workspace 包**

在 `apps/web/package.json` 中加入：

```json
{
  "name": "@clipwise/web",
  "dependencies": {
    "@clipwise/shared": "workspace:*"
  }
}
```

运行：

```bash
pnpm install
pnpm build
```

预期：构建成功。

- [ ] **步骤 5：提交初始化结果**

```bash
git add package.json pnpm-workspace.yaml .gitignore pnpm-lock.yaml apps packages
git commit -m "chore: initialize clipwise workspace"
```

---

### 任务 2：归档需求和原型参考文件

**文件：**

- 创建：`references/clipwise-index-3.html`
- 创建：`references/clipwise-project-5.html`
- 创建：`references/直播回放智能切片工具_SPEC_v0.2.md`
- 创建：`references/直播回放智能切片工具_前端设计稿合集_v0.2.md`
- 创建：`references/README.md`

- [ ] **步骤 1：复制四份真源文件**

运行：

```bash
mkdir -p references
cp /Users/chk/.claude/skills/open-design/.od/projects/ffc60b4d-2b71-4d9f-94d8-605964a03522/clipwise-index-3.html references/
cp /Users/chk/.claude/skills/open-design/.od/projects/ffc60b4d-2b71-4d9f-94d8-605964a03522/clipwise-project-5.html references/
cp outputs/直播回放智能切片工具_SPEC_v0.2.md references/
cp outputs/直播回放智能切片工具_前端设计稿合集_v0.2.md references/
```

- [ ] **步骤 2：写入参考文件说明**

`references/README.md`：

```md
# Clipwise 参考资料

本目录保存需求和视觉真源，仅用于审阅与对照。

- 两份 Markdown 是产品与前端行为真源。
- 两份 HTML 是视觉和交互参考，不直接作为生产代码。
- 生产实现不得保留原型中“选择候选即算已预览”的错误行为。
- 原始完整视频不得上传服务器。
```

- [ ] **步骤 3：校验文件完整性**

运行：

```bash
shasum -a 256 \
  outputs/直播回放智能切片工具_SPEC_v0.2.md \
  references/直播回放智能切片工具_SPEC_v0.2.md \
  outputs/直播回放智能切片工具_前端设计稿合集_v0.2.md \
  references/直播回放智能切片工具_前端设计稿合集_v0.2.md
```

预期：两组源文件与副本哈希分别一致。

- [ ] **步骤 4：提交参考资料**

```bash
git add references
git commit -m "docs: archive clipwise product references"
```

---

### 任务 3：建立领域类型和演示数据

**文件：**

- 创建：`packages/shared/src/domain.ts`
- 创建：`packages/shared/src/fixtures.ts`
- 修改：`packages/shared/src/index.ts`
- 创建：`apps/web/tests/shared/domain.test.ts`

- [ ] **步骤 1：先写失败测试**

`apps/web/tests/shared/domain.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
  getRecommendationLevel,
  mockReadyProject,
  type ClipCandidate,
} from "@clipwise/shared";

describe("Clipwise 领域模型", () => {
  it("按分数映射推荐等级", () => {
    expect(getRecommendationLevel(90)).toBe("强推荐");
    expect(getRecommendationLevel(75)).toBe("推荐");
    expect(getRecommendationLevel(59)).toBe("可选");
  });

  it("演示项目默认包含 5 个展示候选和 7 个总候选", () => {
    expect(mockReadyProject.candidates.slice(0, 5)).toHaveLength(5);
    expect(mockReadyProject.candidates).toHaveLength(7);
  });

  it("候选默认未预览", () => {
    const candidate: ClipCandidate = mockReadyProject.candidates[0];
    expect(candidate.previewStatus).toBe("not_previewed");
  });
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
pnpm --filter @clipwise/web test -- tests/shared/domain.test.ts
```

预期：因为领域类型和测试环境尚未建立而失败。

- [ ] **步骤 3：实现领域类型**

`packages/shared/src/domain.ts`：

```ts
export type ProjectStatus =
  | "waiting_for_video"
  | "extracting_audio"
  | "uploading_audio"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "failed"
  | "expired";

export type VideoConnectionStatus =
  | "missing"
  | "checking"
  | "connected"
  | "mismatch"
  | "unsupported";

export type PreviewStatus =
  | "not_previewed"
  | "previewing"
  | "previewed";

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "failed";
export type ExportStatus =
  | "idle"
  | "confirming"
  | "preparing"
  | "exporting"
  | "completed"
  | "failed";

export type ClipType =
  | "观点"
  | "方法"
  | "案例"
  | "避坑"
  | "对比"
  | "总结"
  | "金句";

export type SubtitleLine = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type ClipCandidate = {
  id: string;
  rank: number;
  finalScore: number;
  type: ClipType;
  startMs: number;
  endMs: number;
  durationMs: number;
  titleOptions: [string, string, string];
  selectedTitle: string;
  summary: string;
  quote: string;
  recommendationReason: string;
  riskNotices: string[];
  subtitles: SubtitleLine[];
  previewStatus: PreviewStatus;
};

export type ClipwiseProject = {
  token: string;
  status: ProjectStatus;
  videoConnectionStatus: VideoConnectionStatus;
  sourceFileName: string;
  sourceFileSize: number;
  durationMs: number;
  expiresAt: string;
  regenerationCount: number;
  candidates: ClipCandidate[];
};

export function getRecommendationLevel(
  score: number,
): "强推荐" | "推荐" | "可选" {
  if (score >= 85) return "强推荐";
  if (score >= 65) return "推荐";
  return "可选";
}
```

- [ ] **步骤 4：实现固定演示项目**

`packages/shared/src/fixtures.ts` 必须导出：

```ts
import type { ClipCandidate, ClipType, ClipwiseProject } from "./domain";

type CandidateSeed = {
  id: string;
  rank: number;
  finalScore: number;
  type: ClipType;
  startMs: number;
  endMs: number;
  titles: [string, string, string];
  summary: string;
  quote: string;
  recommendationReason: string;
  riskNotices?: string[];
};

function createCandidate(seed: CandidateSeed): ClipCandidate {
  return {
    id: seed.id,
    rank: seed.rank,
    finalScore: seed.finalScore,
    type: seed.type,
    startMs: seed.startMs,
    endMs: seed.endMs,
    durationMs: seed.endMs - seed.startMs,
    titleOptions: seed.titles,
    selectedTitle: seed.titles[0],
    summary: seed.summary,
    quote: seed.quote,
    recommendationReason: seed.recommendationReason,
    riskNotices: seed.riskNotices ?? [],
    subtitles: [
      {
        id: `${seed.id}-subtitle-1`,
        startMs: seed.startMs,
        endMs: seed.startMs + 5_000,
        text: seed.quote,
      },
    ],
    previewStatus: "not_previewed",
  };
}

export const mockReadyProject: ClipwiseProject = {
  token: "demo-project",
  status: "ready",
  videoConnectionStatus: "missing",
  sourceFileName: "AI产品需求验证直播回放.mp4",
  sourceFileSize: 1_280_000_000,
  durationMs: 6_180_000,
  expiresAt: "2026-06-29T23:59:59+08:00",
  regenerationCount: 0,
  candidates: [
    createCandidate({
      id: "candidate-1",
      rank: 1,
      finalScore: 92,
      type: "观点",
      startMs: 800_000,
      endMs: 905_000,
      titles: [
        "为什么很多人做 AI 应用第一步就错了",
        "AI 应用失败，往往不是模型问题",
        "做 AI 产品前，先问清楚这个问题",
      ],
      summary: "这一段解释了 AI 应用开发中最容易忽略的需求验证问题。",
      quote: "不是模型不够强，而是你没想清楚用户为什么要用。",
      recommendationReason: "观点完整，有明确结论，可以独立发布。",
    }),
    createCandidate({
      id: "candidate-2",
      rank: 2,
      finalScore: 85,
      type: "方法",
      startMs: 1_630_000,
      endMs: 1_770_000,
      titles: [
        "三个问题判断需求是否成立",
        "需求验证：问这三件事就够了",
        "为什么多数 AI 产品死在需求验证",
      ],
      summary: "三个递进问题帮助产品经理判断一个 AI 需求是否值得做。",
      quote: "用户愿意为什么买单，比模型能做什么重要一万倍。",
      recommendationReason: "方法清晰可复用，适合教程型切片。",
      riskNotices: ["部分表述偏绝对，建议发布前确认。"],
    }),
    createCandidate({
      id: "candidate-3",
      rank: 3,
      finalScore: 78,
      type: "案例",
      startMs: 2_465_000,
      endMs: 2_570_000,
      titles: [
        "一个失败案例：聊了很久需求，上线没人用",
        "为什么用户说需要，实际却不用",
        "口头需求和真实行为是两回事",
      ],
      summary: "团队花两个月沟通需求，上线后用户仍不愿改变原有习惯。",
      quote: "用户说的「我会用」和「我每天都在用」是两回事。",
      recommendationReason: "故事性强，容易引发产品从业者共鸣。",
    }),
    createCandidate({
      id: "candidate-4",
      rank: 4,
      finalScore: 72,
      type: "金句",
      startMs: 3_330_000,
      endMs: 3_380_000,
      titles: [
        "做 AI 产品的黄金法则",
        "先定义问题，再寻找技术",
        "AI 产品成功先把顺序做对",
      ],
      summary: "用简短总结概括整个分享的核心观点。",
      quote: "先定义问题，再找技术。顺序对了，产品就成了。",
      recommendationReason: "短小完整，适合作为独立金句切片。",
    }),
    createCandidate({
      id: "candidate-5",
      rank: 5,
      finalScore: 65,
      type: "对比",
      startMs: 4_095_000,
      endMs: 4_200_000,
      titles: [
        "大模型与小模型：不是参数越多越好",
        "为什么有时小模型更适合产品",
        "选择模型的第一原则：够用",
      ],
      summary: "对比大模型和小模型在实际产品中的使用场景。",
      quote: "在产品层面，够用才是标准。",
      recommendationReason: "对比明确，适合知识平台传播。",
      riskNotices: ["技术参数相关表述需要发布前核实。"],
    }),
    createCandidate({
      id: "candidate-6",
      rank: 6,
      finalScore: 58,
      type: "避坑",
      startMs: 4_960_000,
      endMs: 5_050_000,
      titles: [
        "AI 产品定价最常见的误区",
        "不要按照模型成本给产品定价",
        "功能定价和价值定价的区别",
      ],
      summary: "讨论按照功能和模型成本定价带来的问题。",
      quote: "你的成本不应该直接变成用户的价格。",
      recommendationReason: "有明确避坑价值，但需要补充具体案例。",
      riskNotices: ["定价建议属于商业判断，仅供参考。"],
    }),
    createCandidate({
      id: "candidate-7",
      rank: 7,
      finalScore: 52,
      type: "总结",
      startMs: 5_700_000,
      endMs: 5_790_000,
      titles: [
        "做好 AI 产品的三个核心原则",
        "从需求出发，而不是从技术出发",
        "AI 产品经理应该关注什么",
      ],
      summary: "总结需求第一、小步验证和用户价值三个原则。",
      quote: "技术会变，需求不会。",
      recommendationReason: "总结清晰，适合作为系列内容结尾。",
    }),
  ],
};
```

`packages/shared/src/index.ts`：

```ts
export * from "./domain";
export * from "./fixtures";
```

- [ ] **步骤 5：配置并运行 Vitest**

安装：

```bash
pnpm --filter @clipwise/web add -D vitest jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

在 `apps/web/package.json` 增加：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`apps/web/vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@clipwise/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
```

`apps/web/tests/setup.ts`：

```ts
import "@testing-library/jest-dom/vitest";
```

运行：

```bash
pnpm --filter @clipwise/web test -- tests/shared/domain.test.ts
```

预期：3 个测试通过。

- [ ] **步骤 6：提交领域模型**

```bash
git add packages/shared apps/web/tests apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat: add clipwise domain model and fixtures"
```

---

### 任务 4：实现文件校验和上传页状态

**文件：**

- 创建：`apps/web/lib/file-validation.ts`
- 创建：`apps/web/lib/browser-capabilities.ts`
- 创建：`apps/web/components/upload/UploadPageClient.tsx`
- 创建：`apps/web/components/upload/UploadPage.module.css`
- 修改：`apps/web/app/page.tsx`
- 测试：`apps/web/tests/upload/file-validation.test.ts`
- 测试：`apps/web/tests/upload/upload-page.test.tsx`

- [ ] **步骤 1：写文件校验失败测试**

`apps/web/tests/upload/file-validation.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { validateVideoFile } from "@/lib/file-validation";

describe("validateVideoFile", () => {
  it("拒绝非 MP4 文件", () => {
    const file = new File(["x"], "直播.mov", { type: "video/quicktime" });
    expect(validateVideoFile(file)).toEqual({
      ok: false,
      code: "unsupported_format",
      message: "目前只支持 MP4 回放视频。",
    });
  });

  it("拒绝超过 2GB 的文件", () => {
    const file = { name: "直播.mp4", type: "video/mp4", size: 2_147_483_649 } as File;
    expect(validateVideoFile(file).code).toBe("file_too_large");
  });

  it("接受 2GB 以内的 MP4", () => {
    const file = new File(["video"], "直播.mp4", { type: "video/mp4" });
    expect(validateVideoFile(file).ok).toBe(true);
  });
});
```

- [ ] **步骤 2：运行测试并确认失败**

```bash
pnpm --filter @clipwise/web test -- tests/upload/file-validation.test.ts
```

预期：找不到 `validateVideoFile`。

- [ ] **步骤 3：实现文件校验**

`apps/web/lib/file-validation.ts`：

```ts
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export type FileValidationResult =
  | { ok: true; code: "valid"; message: "" }
  | {
      ok: false;
      code: "unsupported_format" | "file_too_large";
      message: string;
    };

export function validateVideoFile(file: File): FileValidationResult {
  const isMp4 =
    file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");

  if (!isMp4) {
    return {
      ok: false,
      code: "unsupported_format",
      message: "目前只支持 MP4 回放视频。",
    };
  }

  if (file.size > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      message: "文件不能超过 2GB。",
    };
  }

  return { ok: true, code: "valid", message: "" };
}
```

- [ ] **步骤 4：写上传页行为测试**

`apps/web/tests/upload/upload-page.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UploadPageClient } from "@/components/upload/UploadPageClient";

describe("UploadPageClient", () => {
  it("选择文件前只显示选择按钮", () => {
    render(<UploadPageClient />);
    expect(screen.getByRole("button", { name: "选择回放" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "开始分析" })).not.toBeInTheDocument();
  });

  it("选择有效文件后显示独立的开始分析按钮", async () => {
    const user = userEvent.setup();
    render(<UploadPageClient />);
    const input = screen.getByLabelText("选择本地 MP4 回放");
    await user.upload(
      input,
      new File(["video"], "直播.mp4", { type: "video/mp4" }),
    );
    expect(screen.getByText("直播.mp4")).toBeVisible();
    expect(screen.getByRole("button", { name: "开始分析" })).toBeEnabled();
  });
});
```

- [ ] **步骤 5：实现上传页**

`UploadPageClient.tsx` 使用客户端状态：

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validateVideoFile } from "@/lib/file-validation";
import styles from "./UploadPage.module.css";

type UploadState = "empty" | "selected" | "creating" | "error";

export function UploadPageClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("empty");
  const [error, setError] = useState("");

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    const result = validateVideoFile(nextFile);
    if (!result.ok) {
      setFile(null);
      setState("error");
      setError(result.message);
      return;
    }
    setFile(nextFile);
    setState("selected");
    setError("");
  }

  function startAnalysis() {
    if (!file) return;
    sessionStorage.setItem("clipwise-demo-file-name", file.name);
    setState("creating");
    router.push("/project/demo-project");
  }

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1>不用看完整场直播，也能找到高价值片段</h1>
        <p>把 1–2 小时的知识直播回放，变成几段可发布的视频素材。</p>
        <input
          ref={inputRef}
          className={styles.hiddenInput}
          type="file"
          accept="video/mp4"
          aria-label="选择本地 MP4 回放"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />
        <button type="button" onClick={() => inputRef.current?.click()}>
          选择回放
        </button>
        {file && <p>{file.name}</p>}
        {error && <p role="alert">{error}</p>}
        {file && (
          <button
            type="button"
            disabled={state === "creating"}
            onClick={startAnalysis}
          >
            {state === "creating" ? "正在创建项目…" : "开始分析"}
          </button>
        )}
      </section>
    </main>
  );
}
```

`app/page.tsx`：

```tsx
import { UploadPageClient } from "@/components/upload/UploadPageClient";

export default function HomePage() {
  return <UploadPageClient />;
}
```

CSS 按参考上传页还原设计变量、760px 主卡片、三个结果说明卡片、桌面提示和底部限制信息；不得使用渐变和无意义装饰。

- [ ] **步骤 6：运行测试和构建**

```bash
pnpm --filter @clipwise/web test -- tests/upload
pnpm --filter @clipwise/web build
```

预期：上传页测试通过，构建成功。

- [ ] **步骤 7：提交上传页**

```bash
git add apps/web
git commit -m "feat: build clipwise upload page"
```

---

### 任务 5：实现项目 Provider 和项目页骨架

**文件：**

- 创建：`apps/web/lib/project-provider.ts`
- 创建：`apps/web/lib/mock-project-provider.ts`
- 创建：`apps/web/components/project/ProjectWorkspace.tsx`
- 创建：`apps/web/components/project/ProjectWorkspace.module.css`
- 创建：`apps/web/components/project/ProjectHeader.tsx`
- 创建：`apps/web/components/project/ProjectProgress.tsx`
- 修改：`apps/web/app/project/[token]/page.tsx`
- 测试：`apps/web/tests/project/project-provider.test.ts`
- 测试：`apps/web/tests/project/project-workspace.test.tsx`

- [ ] **步骤 1：写 Provider 失败测试**

```ts
import { describe, expect, it } from "vitest";
import { mockProjectProvider } from "@/lib/mock-project-provider";

describe("mockProjectProvider", () => {
  it("按 token 返回项目副本", async () => {
    const project = await mockProjectProvider.getProject("demo-project");
    expect(project.token).toBe("demo-project");
    expect(project.candidates).toHaveLength(7);
  });

  it("未知 token 抛出明确错误", async () => {
    await expect(mockProjectProvider.getProject("missing")).rejects.toThrow(
      "project_not_found",
    );
  });
});
```

- [ ] **步骤 2：实现 Provider 接口**

`project-provider.ts`：

```ts
import type { ClipwiseProject } from "@clipwise/shared";

export interface ProjectProvider {
  getProject(token: string): Promise<ClipwiseProject>;
  saveProject(project: ClipwiseProject): Promise<ClipwiseProject>;
}
```

`mock-project-provider.ts`：

```ts
import { mockReadyProject, type ClipwiseProject } from "@clipwise/shared";
import type { ProjectProvider } from "./project-provider";

function cloneProject(project: ClipwiseProject): ClipwiseProject {
  return structuredClone(project);
}

export const mockProjectProvider: ProjectProvider = {
  async getProject(token) {
    if (token !== mockReadyProject.token) {
      throw new Error("project_not_found");
    }
    return cloneProject(mockReadyProject);
  },
  async saveProject(project) {
    return cloneProject(project);
  },
};
```

- [ ] **步骤 3：写项目页骨架测试**

```tsx
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
```

- [ ] **步骤 4：实现项目页骨架**

`app/project/[token]/page.tsx`：

```tsx
import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";
import { mockProjectProvider } from "@/lib/mock-project-provider";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  try {
    const project = await mockProjectProvider.getProject(token);
    return <ProjectWorkspace initialProject={project} />;
  } catch {
    notFound();
  }
}
```

`ProjectWorkspace` 建立 65/35 布局，左侧先放播放器占位、信息栏和三个 Tab，右侧放候选标题、排序按钮和列表容器。所有区域使用语义化元素和可访问按钮。

- [ ] **步骤 5：运行测试**

```bash
pnpm --filter @clipwise/web test -- tests/project/project-provider.test.ts tests/project/project-workspace.test.tsx
```

预期：全部通过。

- [ ] **步骤 6：提交项目页骨架**

```bash
git add apps/web packages/shared
git commit -m "feat: add project workspace shell"
```

---

### 任务 6：实现候选选择、排序和详情

**文件：**

- 创建：`apps/web/components/project/CandidateList.tsx`
- 创建：`apps/web/components/project/CandidateCard.tsx`
- 创建：`apps/web/components/project/CandidateCard.module.css`
- 创建：`apps/web/features/project-state/useProjectWorkspace.ts`
- 测试：`apps/web/tests/project/candidate-list.test.tsx`

- [ ] **步骤 1：写“选择不等于预览”失败测试**

```tsx
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
    expect(screen.getByText("尚未预览")).toBeVisible();
    expect(screen.queryByText("已预览")).not.toBeInTheDocument();
  });

  it("可按时间顺序排序", async () => {
    const user = userEvent.setup();
    render(<ProjectWorkspace initialProject={mockReadyProject} />);
    await user.click(screen.getByRole("button", { name: "按时间顺序" }));
    expect(
      screen.getAllByTestId("candidate-time")[0],
    ).toHaveTextContent("13:20");
  });
});
```

- [ ] **步骤 2：实现 workspace 状态 Hook**

`useProjectWorkspace.ts`：

```ts
"use client";

import { useMemo, useState } from "react";
import type { ClipwiseProject } from "@clipwise/shared";

export type CandidateSort = "rank" | "time";

export function useProjectWorkspace(initialProject: ClipwiseProject) {
  const [project, setProject] = useState(initialProject);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [sort, setSort] = useState<CandidateSort>("rank");
  const [showAll, setShowAll] = useState(false);

  const candidates = useMemo(() => {
    const source = showAll
      ? [...project.candidates]
      : project.candidates.slice(0, 5);
    return source.sort((a, b) =>
      sort === "rank" ? a.rank - b.rank : a.startMs - b.startMs,
    );
  }, [project.candidates, showAll, sort]);

  const selectedCandidate =
    project.candidates.find(({ id }) => id === selectedCandidateId) ?? null;

  return {
    project,
    setProject,
    candidates,
    selectedCandidate,
    selectedCandidateId,
    setSelectedCandidateId,
    expandedCandidateId,
    setExpandedCandidateId,
    sort,
    setSort,
    showAll,
    setShowAll,
  };
}
```

- [ ] **步骤 3：实现候选卡片**

候选整卡使用一个带明确 `aria-label` 的选择按钮；“预览片段”和“查看详情”是独立按钮，必须阻止事件冒泡。卡片显示 `finalScore` 映射后的推荐等级，但不展示技术评分细节。

详情区只显示三个标题候选、推荐理由和风险提示，不放导出按钮。

- [ ] **步骤 4：运行测试和 lint**

```bash
pnpm --filter @clipwise/web test -- tests/project/candidate-list.test.tsx
pnpm --filter @clipwise/web lint
```

预期：测试和 lint 通过。

- [ ] **步骤 5：提交候选列表**

```bash
git add apps/web
git commit -m "feat: add candidate browsing and selection"
```

---

### 任务 7：实现真实本地播放器和预览进度

**文件：**

- 创建：`apps/web/features/local-video/preview-progress.ts`
- 创建：`apps/web/features/local-video/useLocalVideo.ts`
- 创建：`apps/web/components/project/LocalVideoPlayer.tsx`
- 创建：`apps/web/components/project/LocalVideoPlayer.module.css`
- 测试：`apps/web/tests/local-video/preview-progress.test.ts`
- 测试：`apps/web/tests/local-video/local-video-player.test.tsx`

- [ ] **步骤 1：写预览进度失败测试**

```ts
import { describe, expect, it } from "vitest";
import { getPreviewStatus } from "@/features/local-video/preview-progress";

describe("getPreviewStatus", () => {
  it("不足 80% 时保持预览中", () => {
    expect(getPreviewStatus(79_999, 100_000)).toBe("previewing");
  });

  it("达到 80% 时标记已预览", () => {
    expect(getPreviewStatus(80_000, 100_000)).toBe("previewed");
  });
});
```

- [ ] **步骤 2：实现纯函数**

```ts
import type { PreviewStatus } from "@clipwise/shared";

export function getPreviewStatus(
  playedMs: number,
  durationMs: number,
): PreviewStatus {
  if (playedMs <= 0 || durationMs <= 0) return "not_previewed";
  return playedMs / durationMs >= 0.8 ? "previewed" : "previewing";
}
```

- [ ] **步骤 3：写播放器行为测试**

测试必须验证：

- 没有本地视频时显示“重新选择原视频”。
- 选中候选但未播放时显示“尚未预览”。
- `timeupdate` 到达 `endMs` 后调用 `pause()`。
- 预览进度达到 80% 时触发 `onPreviewStatusChange("previewed")`。

使用 `Object.defineProperty(video, "currentTime", { value: ... })` 和 `vi.spyOn(HTMLMediaElement.prototype, "pause")` 模拟媒体事件。

- [ ] **步骤 4：实现 `useLocalVideo`**

Hook 负责：

- 保存 `File | null`
- 创建和释放对象 URL
- 连接状态
- 当前候选起止时间
- 有效播放进度
- 到达结束时间自动暂停

对象 URL 必须在文件切换和组件卸载时调用 `URL.revokeObjectURL`。

- [ ] **步骤 5：实现播放器 UI**

播放器必须使用：

```tsx
<video
  ref={videoRef}
  src={objectUrl ?? undefined}
  controls={Boolean(objectUrl)}
  onTimeUpdate={handleTimeUpdate}
  onSeeked={handleSeeked}
/>
```

没有视频时显示关联提示和文件选择按钮；有视频但没选候选时显示“从右侧选择候选片段”；选中候选后显示时间范围、播放按钮和预览状态。

- [ ] **步骤 6：运行测试**

```bash
pnpm --filter @clipwise/web test -- tests/local-video
```

预期：全部通过。

- [ ] **步骤 7：提交播放器**

```bash
git add apps/web
git commit -m "feat: add local range video preview"
```

---

### 任务 8：实现文案、字幕编辑和自动保存

**文件：**

- 创建：`apps/web/features/autosave/useAutosave.ts`
- 创建：`apps/web/components/project/EditorTabs.tsx`
- 创建：`apps/web/components/project/CopyEditor.tsx`
- 创建：`apps/web/components/project/SubtitleEditor.tsx`
- 创建：`apps/web/components/project/Editor.module.css`
- 测试：`apps/web/tests/autosave/use-autosave.test.tsx`
- 测试：`apps/web/tests/project/editor-tabs.test.tsx`

- [ ] **步骤 1：写自动保存失败测试**

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutosave } from "@/features/autosave/useAutosave";

describe("useAutosave", () => {
  it("修改后先变 dirty，500ms 后保存", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, 500));

    act(() => result.current.schedule({ title: "新标题" }));
    expect(result.current.status).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(save).toHaveBeenCalledWith({ title: "新标题" });
    expect(result.current.status).toBe("saved");
    vi.useRealTimers();
  });
});
```

- [ ] **步骤 2：实现自动保存 Hook**

Hook 返回：

```ts
{
  status: SaveStatus;
  schedule: (payload: T) => void;
  retry: () => Promise<void>;
}
```

保存流程严格为：

```text
clean → dirty → saving → saved
                    ↘ failed
```

同一时间只允许一个定时器；新输入覆盖尚未提交的旧负载。

- [ ] **步骤 3：写编辑器测试**

测试必须验证：

- 没选候选时显示空状态。
- 标题、摘要和金句可编辑。
- 推荐理由和风险提示只读。
- 字幕只能改文本，时间码只读。
- 切换候选时加载对应数据。
- 保存状态显示“保存中 / 已保存 / 保存失败”。

- [ ] **步骤 4：实现文案和字幕编辑器**

`CopyEditor` 接收：

```ts
type CopyEditorProps = {
  candidate: ClipCandidate;
  saveStatus: SaveStatus;
  onChange: (candidate: ClipCandidate) => void;
};
```

`SubtitleEditor` 使用每行 `SubtitleLine.id` 作为键，时间码通过统一 `formatTimecode(ms)` 显示，不允许修改。

第一阶段的保存函数调用 `mockProjectProvider.saveProject`，并同步更新 workspace 内存状态。

- [ ] **步骤 5：运行测试**

```bash
pnpm --filter @clipwise/web test -- tests/autosave tests/project/editor-tabs.test.tsx
```

预期：全部通过。

- [ ] **步骤 6：提交编辑器**

```bash
git add apps/web
git commit -m "feat: add autosaving copy and subtitle editors"
```

---

### 任务 9：实现导出 Tab 和未预览提醒

**文件：**

- 创建：`apps/web/components/project/ExportPanel.tsx`
- 创建：`apps/web/components/project/ExportPanel.module.css`
- 创建：`apps/web/features/project-state/export-machine.ts`
- 测试：`apps/web/tests/project/export-panel.test.tsx`
- 测试：`apps/web/tests/project/export-machine.test.ts`

- [ ] **步骤 1：写导出状态机失败测试**

```ts
import { describe, expect, it } from "vitest";
import { requestExport } from "@/features/project-state/export-machine";

describe("requestExport", () => {
  it("未预览时进入确认状态", () => {
    expect(requestExport("not_previewed")).toBe("confirming");
  });

  it("已预览时直接进入准备状态", () => {
    expect(requestExport("previewed")).toBe("preparing");
  });
});
```

- [ ] **步骤 2：实现最小状态机**

```ts
import type { ExportStatus, PreviewStatus } from "@clipwise/shared";

export function requestExport(previewStatus: PreviewStatus): ExportStatus {
  return previewStatus === "previewed" ? "preparing" : "confirming";
}
```

- [ ] **步骤 3：写导出面板测试**

测试必须验证：

- 未选候选时全部导出动作禁用。
- 未连接原视频时快速导出禁用。
- 未预览时点击导出显示“建议先预览”。
- “先预览”切回预览流程。
- “继续导出”显示第一阶段占位状态“导出能力将在第三阶段接通”，不得伪造下载完成。
- 带字幕视频说明“只上传当前短片”。

- [ ] **步骤 4：实现导出面板**

面板保留三块：

```text
快速导出当前片段
批量快速导出 TOP 5
生成带字幕视频
```

第一阶段禁止使用定时器伪造“导出完成”。按钮点击后只进入明确的开发阶段说明状态，以免原型行为被误认为真实能力。

- [ ] **步骤 5：运行测试**

```bash
pnpm --filter @clipwise/web test -- tests/project/export
```

如果测试路径按文件名运行：

```bash
pnpm --filter @clipwise/web test -- tests/project/export-panel.test.tsx tests/project/export-machine.test.ts
```

预期：全部通过。

- [ ] **步骤 6：提交导出状态**

```bash
git add apps/web
git commit -m "feat: add export confirmation flow"
```

---

### 任务 10：实现项目异常状态和原视频重新关联

**文件：**

- 创建：`apps/web/components/project/ProjectStateView.tsx`
- 创建：`apps/web/components/project/ReconnectVideoBanner.tsx`
- 创建：`apps/web/features/local-video/file-fingerprint.ts`
- 测试：`apps/web/tests/local-video/file-fingerprint.test.ts`
- 测试：`apps/web/tests/project/project-state-view.test.tsx`

- [ ] **步骤 1：写文件指纹失败测试**

第一阶段只实现可测试的指纹结构，不上传文件：

```ts
import { describe, expect, it } from "vitest";
import { createFingerprintMetadata } from "@/features/local-video/file-fingerprint";

describe("createFingerprintMetadata", () => {
  it("包含文件名、大小和时长", () => {
    expect(
      createFingerprintMetadata(
        { name: "直播.mp4", size: 1024 } as File,
        7_200_000,
      ),
    ).toEqual({
      name: "直播.mp4",
      size: 1024,
      durationMs: 7_200_000,
    });
  });
});
```

- [ ] **步骤 2：实现指纹元数据**

```ts
export type FingerprintMetadata = {
  name: string;
  size: number;
  durationMs: number;
};

export function createFingerprintMetadata(
  file: File,
  durationMs: number,
): FingerprintMetadata {
  return { name: file.name, size: file.size, durationMs };
}
```

采样哈希留到第二阶段真实 reconnect API 实现，不在第一阶段编造服务端校验。

- [ ] **步骤 3：写项目状态视图测试**

分别构造以下状态并断言文案和可用操作：

- `extracting_audio`
- `uploading_audio`
- `transcribing`
- `analyzing`
- `failed`
- `expired`
- `ready + missing video`
- `ready + mismatch video`

- [ ] **步骤 4：实现状态视图**

技术名词不得直接暴露给用户：

```text
FFmpeg.wasm → 正在读取视频
ASR → 正在识别语音
LLM → 正在分析内容
```

`failed` 显示失败阶段和“重试”按钮；`expired` 只提供“新建项目”；`missing` 和 `mismatch` 提供“重新选择原视频”。

- [ ] **步骤 5：运行测试**

```bash
pnpm --filter @clipwise/web test -- tests/local-video/file-fingerprint.test.ts tests/project/project-state-view.test.tsx
```

预期：全部通过。

- [ ] **步骤 6：提交恢复状态**

```bash
git add apps/web
git commit -m "feat: add project recovery states"
```

---

### 任务 11：完成视觉系统、响应式和无障碍检查

**文件：**

- 修改：`apps/web/app/globals.css`
- 修改：`apps/web/components/**/*.module.css`
- 修改：`apps/web/app/layout.tsx`
- 测试：`apps/web/tests/ui/accessibility.test.tsx`

- [ ] **步骤 1：写基础无障碍测试**

安装：

```bash
pnpm --filter @clipwise/web add -D axe-core vitest-axe
```

测试：

```tsx
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { UploadPageClient } from "@/components/upload/UploadPageClient";

describe("基础无障碍", () => {
  it("上传页没有可检测到的严重问题", async () => {
    const { container } = render(<UploadPageClient />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

在 `tests/setup.ts` 注册 `vitest-axe` 匹配器。

- [ ] **步骤 2：建立全局设计变量**

`globals.css` 至少包含：

```css
:root {
  --color-bg: oklch(99% 0.002 240);
  --color-surface: oklch(100% 0 0);
  --color-text: oklch(18% 0.012 250);
  --color-muted: oklch(54% 0.012 250);
  --color-border: oklch(92% 0.005 250);
  --color-accent: oklch(58% 0.18 255);
  --color-accent-soft: oklch(94% 0.04 255);
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --shadow-focus: 0 0 0 3px oklch(75% 0.12 255 / 0.35);
}

*:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
```

- [ ] **步骤 3：实现响应式规则**

验证尺寸：

```text
1440×900：完整 65/35 双栏
1280×720：双栏，编辑区可滚动
1024×768：双栏压缩，候选栏不低于 320px
小于 900px：显示“请使用桌面端 Chrome / Edge”，不启动视频处理
```

不得为了移动端强行实现视频处理流程。

- [ ] **步骤 4：运行测试、lint 和构建**

```bash
pnpm --filter @clipwise/web test
pnpm --filter @clipwise/web lint
pnpm --filter @clipwise/web build
```

预期：全部成功，无控制台错误。

- [ ] **步骤 5：提交视觉完善**

```bash
git add apps/web
git commit -m "style: refine clipwise visual system"
```

---

### 任务 12：加入 Playwright 关键路径验收

**文件：**

- 创建：`apps/web/playwright.config.ts`
- 创建：`apps/web/e2e/upload-to-project.spec.ts`
- 创建：`apps/web/e2e/project-interactions.spec.ts`
- 修改：`apps/web/package.json`

- [ ] **步骤 1：安装 Playwright**

```bash
pnpm --filter @clipwise/web add -D @playwright/test
pnpm --filter @clipwise/web exec playwright install chromium
```

`apps/web/package.json`：

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

- [ ] **步骤 2：配置本地服务**

`playwright.config.ts`：

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
```

- [ ] **步骤 3：写上传到项目页测试**

```ts
import { expect, test } from "@playwright/test";

test("选择 MP4 后进入演示项目", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("选择本地 MP4 回放")
    .setInputFiles({
      name: "直播回放.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("demo-video"),
    });
  await expect(page.getByText("直播回放.mp4")).toBeVisible();
  await page.getByRole("button", { name: "开始分析" }).click();
  await expect(page).toHaveURL(/\/project\/demo-project$/);
  await expect(page.getByRole("heading", { name: "候选片段" })).toBeVisible();
});
```

- [ ] **步骤 4：写项目交互测试**

验证：

- 点击候选后仍显示“尚未预览”。
- 文案 Tab 可修改标题并出现保存状态。
- 字幕 Tab 可修改文本。
- 导出 Tab 在未预览时出现提醒。
- “查看更多候选”从 5 个变为 7 个。
- “按时间顺序”可切换。

- [ ] **步骤 5：运行完整验收**

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
```

预期：单元、组件、端到端测试全部通过，构建成功。

- [ ] **步骤 6：提交端到端测试**

```bash
git add apps/web
git commit -m "test: cover clipwise front-end user flow"
```

---

### 任务 13：浏览器视觉验收和第一阶段交付

**文件：**

- 创建：`docs/phase-1-verification.md`
- 修改：发现问题对应的组件或样式文件

- [ ] **步骤 1：启动应用**

```bash
pnpm dev
```

预期：`http://127.0.0.1:3000` 可访问。

- [ ] **步骤 2：使用浏览器逐页检查**

检查上传页：

- 1440×900 下主标题不溢出。
- 选择文件和开始分析是两个动作。
- 隐私说明清晰。
- 键盘可操作。

检查项目页：

- 1280×720 下播放器、编辑区和候选栏均可用。
- 候选卡片选中态清晰。
- 选择不等于已预览。
- 缺少原视频时出现重新关联入口。
- 编辑器滚动不影响右侧候选列表。
- 导出提醒不会伪造真实导出完成。

- [ ] **步骤 3：记录验收结果**

`docs/phase-1-verification.md`：

```md
# Clipwise 第一阶段验收记录

## 自动验证

- `pnpm test`：通过
- `pnpm test:e2e`：通过
- `pnpm lint`：通过
- `pnpm build`：通过

## 浏览器验证

- 上传页 1440×900：通过
- 项目页 1280×720：通过
- 项目页 1440×900：通过
- 候选选择与预览状态分离：通过
- 文案和字幕编辑：通过
- 未预览导出提醒：通过
- 原视频重新关联入口：通过

## 第一阶段边界

当前使用模拟 Provider。Groq、DeepSeek、Postgres、FFmpeg.wasm 音频提取和真实文件导出将在后续独立计划中接通。
```

- [ ] **步骤 4：运行最终验证**

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
git status --short
```

预期：所有验证通过；工作区仅包含计划内改动。

- [ ] **步骤 5：提交第一阶段交付**

```bash
git add .
git commit -m "feat: complete clipwise phase one front-end"
```

---

## 二、规格覆盖检查

本计划覆盖第一阶段以下要求：

- 上传页与项目页
- 保留现有原型视觉方向
- 真实本地 `<video>` 播放器
- 候选、选中、预览、导出状态分离
- TOP 5 默认展示、TOP 7 演示数据与排序
- 文案和字幕编辑
- 自动保存状态
- 未预览导出提醒
- 原视频缺失与重新关联入口
- 分析中、失败、过期状态
- 桌面端响应式
- 单元、组件和端到端测试

本计划明确不实现：

- FFmpeg.wasm 音频抽取
- Groq ASR
- DeepSeek 高光评分
- Postgres 和 Worker
- SSE 任务进度与五秒轮询兜底
- 真实 MP4/SRT/TXT/JPG/ZIP 导出
- 服务端字幕烧录

以上内容分别进入第二阶段“真实 AI 管线”、第三阶段“真实导出”和第四阶段“SSE 任务进度”实施计划。
