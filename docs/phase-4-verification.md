# Clipwise 第四阶段验收记录

验收日期：2026-06-23

## 自动验证

| 检查项 | 结果 |
|---|---|
| `pnpm test`（vitest 单测，排除集成） | ✅ 35 文件 / 91 测试通过 |
| Python Worker `pytest` | ✅ 23 测试通过 |
| `pnpm test:e2e`（chromium + webkit） | ✅ 8 测试通过 |
| `pnpm lint`（ESLint） | ✅ 0 errors |
| `pnpm build`（Next.js 生产构建） | ✅ 通过 |
| COOP/COEP header 验证 | ✅ 3 个 header 生效 |
| 真实 ASR 集成测试 | ✅ 真实端到端跑通（见下"真实端到端验证"） |

## Phase 4 建成的东西

### 后端
- **GroqTranscriber**（asr.py）：调 Groq whisper-large-v3，verbose_json + word 时间戳 + language=zh
- **merge_segments_with_offset**：多块偏移合并 + 30 秒 overlap 去重（design §17.2 要求）
- **save_transcript**：写 transcript_segments 表
- **pipeline transcribe_audio 分支**：读音频块 → 逐块调 Groq → 合并 → 写 transcript → 删音频（§15）→ 创建 generate_candidates job（双 job 编排）
- **config 扩展**：WorkerConfig 加 groq_api_key/groq_asr_model/storage_root
- **schema 扩展**：project_files 加 chunk_index + start_offset_ms 列

### 前端
- **COOP/COEP header**：next.config.ts 加 3 个 header 启用 SharedArrayBuffer
- **ffmpeg.wasm 集成**：@ffmpeg/ffmpeg + @ffmpeg/util
- **calculateChunks**：纯函数，30 分钟分块 + 30 秒 overlap
- **getFFmpeg + extractAudioChunks**：16kHz mono 48kbps mp3 提取
- **useAudioExtraction Hook**：状态机 creating-project → loading-ffmpeg → extracting → uploading → done
- **UploadPageClient**：实时进度（"正在加载处理引擎…" → "正在提取音频…X%" → "正在上传…"），错误重试，完成跳任务页

### API
- **audio endpoint** 改造：接受 chunkIndex/startOffsetMs/isLastChunk，job type 改 transcribe_audio

## 链路验证（design §8 / §17.2）

- ✅ 浏览器 ffmpeg.wasm 提取 16kHz mono mp3（单元测试覆盖 calculateChunks）
- ✅ 30 分钟分块 + 30 秒 overlap
- ✅ 分块上传 + transcribe_audio job 创建
- ✅ Worker 调 Groq（单块 mock 测试 + 多块合并测试）
- ✅ 分块偏移合并 + overlap 去重（5 个测试，含 30s 真实场景）
- ✅ transcript_segments 表填充
- ✅ ASR 成功后删音频文件（§15）
- ✅ 双 job 衔接（transcribe → generate）
- ✅ 真实端到端（见下）

## 真实端到端验证（2026-06-23 14:08）

用浏览器 ffmpeg.wasm 从用户视频（`飞书20260623-131141.mp4`，97MB）提取的 2.8MB mp3，经真实 API + 线上 Worker + 真实 Groq 跑通：

| 环节 | 结果 |
|---|---|
| `POST /api/projects` 建项目 | ✅ token=DeLC0q4k… |
| `POST /api/projects/{token}/audio`（单块 isLastChunk） | ✅ 202 + taskId |
| `project_files.storage_path` 绝对路径（STORAGE_ROOT 修复） | ✅ `/Users/chk/…/storage/DeLC0q4k…/bb21…mp3` |
| Worker 认领 transcribe_audio（dict 修复后） | ✅ running → succeeded |
| 真实 Groq whisper-large-v3 转写 | ✅ 326 条 transcript_segments |
| 转写内容样例 | ✅ "AI用开发如何从0干到40k / 今天这两个视频不看就是你的损失…" |
| ASR 后删音频（§15 隐私） | ✅ 0 个音频文件残留 |
| 双 job 衔接：自动建 generate_candidates | ✅ succeeded，7 个候选 |
| 项目最终状态 | ✅ ready |

过程中发现并修复的两个真实 bug：
1. **STORAGE_ROOT 相对路径**：web 用 `./storage`（解析到 `apps/web/storage/`），Worker cwd 是 `services/worker/` 找不到文件。修复：audio route 用 `resolve()` 存绝对路径（commit `6383a01`）。
2. **Groq SDK 返回 dict 不是对象**：`seg.id` 抛 `'dict' object has no attribute 'id'`。修复：asr.py 用 `isinstance(seg, dict)` 兼容（commit `97a1b38`）。mock 测试用 MagicMock 掩盖了这个问题。

## 失败恢复（design §16）

- ✅ 无音频文件：error_code=no_audio
- ✅ Groq 调用失败：error_code=asr_chunk_failed（单块独立可重试）

## 第四阶段边界（明确不做）

- 候选评分用 mock_ai（Phase 5 换 DeepSeek）
- 本地导出 MP4/SRT/TXT（Phase 6）
- StorageProvider 抽象（Phase 6）
- ~~视频时长 durationMs 真实读取（先传 0，后期从 `<video>` 元素补）~~ → **Phase 4.1 已完成**：`probeVideoDurationMs` 读真实时长，长视频自动分块。
- 失败重投递完整 UI（本阶段只 mark_failed + error_code）

## Phase 4.1 长视频分片（2026-06-23）

修复了前端硬编码 20 分钟时长的 bug：之前 `calculateChunks` 永远只算出 1 块，导致 2 小时视频的 mp3 (~43MB) 超 Groq 25MB 限制而失败。

**改动**：
- 新增 `probeVideoDurationMs(file)`：用临时 `<video>` 读 `loadedmetadata` 的真实时长，`duration=Infinity` 时走 seek-to-tail fallback。
- `use-audio-extraction` 调用 `probeVideoDurationMs` 拿真实时长 → 传给 `calculateChunks` → 长视频自动切成 30 分钟块（每块 ~10MB < 25MB）。
- 真实 `durationMs` 传给 create-project API（替代之前的占位 `0`）。
- worker 侧（逐块调 Groq + `merge_segments_with_offset` 偏移合并）**无需改动**，早已支持多块。

**验证**：Web 单测 111 passed（+2 probe 测试），E2E 8 passed，lint/build 通过。真实验收需 >30 分钟视频触发多块。

## ⚠️ 安全提醒

用户在对话中提供的 Groq API key 已泄露，必须去 console.groq.com revoke 并重新生成。新 key 直接编辑 `apps/web/.env` 和 `services/worker/.env` 的 GROQ_API_KEY 行（两个文件都要改）。

## 启动方式（Phase 4 后）

需要四个服务（新增 GROQ_API_KEY）：
```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed   # 数据库
pnpm dev                                         # 网页 + API（带 COOP/COEP header）
cd services/worker                               # Worker（读 GROQ_API_KEY）
uv run python -m clipwise_worker.main
```
