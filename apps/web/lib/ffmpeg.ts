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

/**
 * 用 ffmpeg.wasm 按时间戳切出一段 MP4（流拷贝，不重新编码）。
 *
 * -c copy 秒级完成、无损，切口对齐到最近关键帧（最多差几帧，
 * 知识直播场景可接受）。返回 video/mp4 Blob。
 *
 * ffmpeg 参数说明：
 * -ss start  - 跳到指定秒数（输入前 seek，快）
 * -i input   - 输入文件
 * -t dur     - 只取指定秒数
 * -c copy    - 直接拷贝音视频流，不重新编码
 * -avoid_negative_ts make_zero - 把负时间戳归零，避免某些播放器开头黑屏
 */
export async function sliceVideoClip(
  file: File,
  startMs: number,
  endMs: number,
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const inputName = "source.mp4";
  const outputName = "clip.mp4";
  const startSec = startMs / 1000;
  const durationSec = (endMs - startMs) / 1000;

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  await ffmpeg.exec([
    "-ss",
    String(startSec),
    "-i",
    inputName,
    "-t",
    String(durationSec),
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  await ffmpeg.deleteFile(outputName);
  await ffmpeg.deleteFile(inputName);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" });
}

/**
 * 用 HTML5 <video> 元素探测视频真实时长（毫秒）。
 *
 * 创建临时 video 元素，等 loadedmetadata 读 duration。
 * 某些格式（部分 webm / 无 moov 原子的 mp4）初始 duration 为 Infinity，
 * 此时用 seek 探测：把 currentTime 设到极大值，浏览器会跳到真实尾部，
 * timeupdate 事件里读到的 currentTime 即近似时长。
 *
 * 零依赖、不解码全片，只读 metadata（约 0.5-2 秒）。
 */
export async function probeVideoDurationMs(file: File): Promise<number> {
  const video = document.createElement("video");
  video.preload = "metadata";
  const url = URL.createObjectURL(file);
  video.src = url;

  try {
    const durationSec = await new Promise<number>((resolve) => {
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (Number.isFinite(video.duration)) {
            resolve(video.duration);
            return;
          }
          // Infinity fallback：seek 到尾部探测真实时长
          const onTimeUpdate = () => {
            resolve(video.currentTime);
            video.removeEventListener("timeupdate", onTimeUpdate);
          };
          video.addEventListener("timeupdate", onTimeUpdate);
          video.currentTime = 1e101;
        },
        { once: true },
      );
    });
    return Math.round(durationSec * 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
