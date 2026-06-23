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
| 真实 ASR 集成测试 | ⏳ 待用户拿到 Groq key + 视频后跑 |

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
- ⏳ 真实端到端（待 Groq key + 真实视频）

## 失败恢复（design §16）

- ✅ 无音频文件：error_code=no_audio
- ✅ Groq 调用失败：error_code=asr_chunk_failed（单块独立可重试）

## 第四阶段边界（明确不做）

- 候选评分用 mock_ai（Phase 5 换 DeepSeek）
- 本地导出 MP4/SRT/TXT（Phase 6）
- StorageProvider 抽象（Phase 6）
- 视频时长 durationMs 真实读取（先传 0，后期从 `<video>` 元素补）
- 失败重投递完整 UI（本阶段只 mark_failed + error_code）

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
