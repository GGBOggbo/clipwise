# Clipwise Phase 6 验收记录

日期：2026-06-23

## 范围

Phase 6 实现本地快速导出：浏览器用 ffmpeg.wasm 按时间戳切 MP4（`-c copy` 流拷贝），生成 SRT 字幕 + TXT 文案，单片段下载 + TOP 5 批量打包 ZIP。原视频全程不上传服务器，纯前端完成。

**范围决策**：只做快速导出（带字幕成片导出需服务器烧字幕，留后续）。

## 建成的东西

- `lib/export-clip.ts` — 纯函数：`buildSrtContent`（字幕相对片段起点的时间码）、`buildTxtContent`（标题+摘要+金句）、`buildClipFileName`（rank 前缀 + 安全文件名）。
- `lib/ffmpeg.ts` 加 `sliceVideoClip` — `-ss/-i/-t/-c copy/-avoid_negative_ts make_zero`，复用 Phase 4 的 `getFFmpeg` 单例，返回 video/mp4 Blob。
- `features/project-state/use-export-clip.ts` — 状态机 hook（idle→slicing→packaging→done/failed）：`exportSingle` 切 MP4+SRT+TXT 分别下载；`exportBatch` 串行切 TOP N → fflate ZIP 打包单个下载；防并发，失败不部分下载。
- `ExportPanel` 接真实导出：单片段 + TOP 5 批量按钮、进度展示（"正在切片 2/5…"）、完成/失败提示，替换原占位文案。
- `ProjectWorkspace` → `EditorTabs` → `ExportPanel` 透传 `localFile` + `candidates`。

## 自动测试

| 项目 | 结果 |
|---|---|
| Web 单测 | ✅ 39 文件 / 108 测试（+11：export-clip 6 + ffmpeg-slice 2 + use-export-clip 3） |
| E2E (chromium + webkit) | ✅ 8 passed |
| Lint | ✅ 0 errors 0 warnings |
| Build | ✅ 生产构建通过 |
| `git diff --check` | ✅ 无空白错误 |

## 真实浏览器手测

状态：⏳ 待手测。流程：选候选 → 关联本地原视频 → 导出 tab → 快速导出当前片段 → 验证下载 MP4+SRT+TXT（MP4 可播放、SRT 时间码正确、TXT 含标题摘要金句）→ 批量导出 TOP 5 → 验证单个 ZIP。

## 已知边界

- `-c copy` 切口对齐关键帧，开头/结尾可能差几帧（SPEC 4.6 "快速切片方式"可接受）。若需精确帧，后续可加二次 `-ss` 精确 seek。
- 带字幕成片导出（服务器烧字幕）未做。
- SRT 时间码基于字幕的绝对时间减片段起点；若字幕未覆盖整段，对应时段无字幕 cue。
