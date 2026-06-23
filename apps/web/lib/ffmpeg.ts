import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// ffmpeg.wasm core 从 CDN 加载（首次 ~25MB，之后浏览器缓存）
const FFMPEG_CORE_VERSION = "0.12.10";
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;
const FFMPEG_CORE_URL = `${FFMPEG_CORE_BASE}/ffmpeg-core.js`;
const FFMPEG_WASM_URL = `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`;

let ffmpegInstance: FFmpeg | null = null;

export type ChunkPlan = {
  startOffsetMs: number;
  durationMs: number;
};

/**
 * 计算音频分块计划（纯函数，便于测试）。
 *
 * 短视频（≤ chunkDurationMs）只切 1 块；
 * 长视频按 chunkDurationMs 切，相邻块重叠 overlapMs（避免句子被切断）。
 */
export function calculateChunks(
  totalDurationMs: number,
  chunkDurationMs: number,
  overlapMs: number,
): ChunkPlan[] {
  if (totalDurationMs <= chunkDurationMs) {
    return [{ startOffsetMs: 0, durationMs: totalDurationMs }];
  }

  const chunks: ChunkPlan[] = [];
  const stepMs = chunkDurationMs - overlapMs;
  let cursor = 0;
  while (cursor < totalDurationMs) {
    const duration = Math.min(chunkDurationMs, totalDurationMs - cursor);
    chunks.push({ startOffsetMs: cursor, durationMs: duration });
    cursor += stepMs;
    // 剩余不足一个 overlap 就结束（避免产生极短的尾块）
    if (totalDurationMs - cursor < overlapMs) break;
  }
  return chunks;
}

/** 加载 ffmpeg.wasm（单例，首次从 CDN 下载 core） */
export async function getFFmpeg(
  onLog?: (msg: string) => void,
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  ffmpegInstance = new FFmpeg();
  if (onLog) {
    ffmpegInstance.on("log", ({ message }) => onLog(message));
  }
  await ffmpegInstance.load({
    coreURL: await toBlobURL(FFMPEG_CORE_URL, "text/javascript"),
    wasmURL: await toBlobURL(FFMPEG_WASM_URL, "application/wasm"),
  });
  return ffmpegInstance;
}

/**
 * 从视频文件提取 16kHz 单声道 mp3，按 chunkPlan 分块。
 * 返回 Blob[]（每个 Blob 是一个 mp3 块）。
 *
 * ffmpeg 参数说明：
 * -ss start  - 跳到指定秒数（快）
 * -i input   - 输入文件
 * -t dur     - 只取指定秒数
 * -vn        - 去掉视频流
 * -ac 1      - 单声道
 * -ar 16000  - 16kHz 采样率（Whisper 训练分布）
 * -b:a 48k   - 48kbps（够语音用，30 分钟约 10MB，远低于 Groq 25MB 限制）
 */
export async function extractAudioChunks(
  file: File,
  chunks: ChunkPlan[],
  onProgress?: (ratio: number) => void,
): Promise<Blob[]> {
  const ffmpeg = await getFFmpeg();
  const inputName = "input.mp4";
  const blobs: Blob[] = [];

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const outputName = `chunk_${i}.mp3`;
    const startSec = chunk.startOffsetMs / 1000;
    const durationSec = chunk.durationMs / 1000;

    await ffmpeg.exec([
      "-ss",
      String(startSec),
      "-i",
      inputName,
      "-t",
      String(durationSec),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "48k",
      "-f",
      "mp3",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    blobs.push(new Blob([bytes.buffer as ArrayBuffer], { type: "audio/mpeg" }));
    await ffmpeg.deleteFile(outputName);

    if (onProgress) {
      onProgress((i + 1) / chunks.length);
    }
  }

  await ffmpeg.deleteFile(inputName);
  return blobs;
}
