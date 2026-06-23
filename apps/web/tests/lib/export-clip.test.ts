import { describe, expect, it } from "vitest";
import type { ClipCandidate, SubtitleLine } from "@clipwise/shared";
import {
  buildClipFileName,
  buildSrtContent,
  buildTxtContent,
} from "@/lib/export-clip";

function subtitle(id: string, startMs: number, endMs: number, text: string): SubtitleLine {
  return { id, startMs, endMs, text };
}

describe("buildSrtContent", () => {
  it("生成相对片段起点的标准 SRT", () => {
    // candidate 从源视频 30000ms 开始；字幕绝对时间是 35000~37000
    const srt = buildSrtContent(
      [
        subtitle("s1", 35_000, 37_000, "第一句话"),
        subtitle("s2", 37_000, 39_500, "第二句话"),
      ],
      30_000,
    );

    expect(srt).toBe(
      [
        "1",
        "00:00:05,000 --> 00:00:07,000",
        "第一句话",
        "",
        "2",
        "00:00:07,000 --> 00:00:09,500",
        "第二句话",
        "",
      ].join("\n"),
    );
  });

  it("跳过落在片段范围之外的字幕", () => {
    const srt = buildSrtContent(
      [
        subtitle("before", 10_000, 20_000, "片段之前"),
        subtitle("inside", 30_000, 40_000, "片段内"),
      ],
      30_000,
    );

    expect(srt).toContain("片段内");
    expect(srt).not.toContain("片段之前");
  });

  it("空字幕返回空字符串", () => {
    expect(buildSrtContent([], 0)).toBe("");
  });
});

describe("buildTxtContent", () => {
  it("包含标题、摘要和金句", () => {
    const candidate = {
      selectedTitle: "AI 产品方法论",
      summary: "需求验证比模型能力更重要。",
      quote: "先定义问题，再找技术。",
    } as ClipCandidate;

    const txt = buildTxtContent(candidate);

    expect(txt).toContain("AI 产品方法论");
    expect(txt).toContain("需求验证比模型能力更重要。");
    expect(txt).toContain("先定义问题，再找技术。");
  });
});

describe("buildClipFileName", () => {
  it("生成 rank 前缀 + 标题 slug 的文件名", () => {
    expect(buildClipFileName(1, "AI 产品方法论", "mp4")).toBe(
      "01-AI 产品方法论.mp4",
    );
    expect(buildClipFileName(5, "如何做需求验证", "srt")).toBe(
      "05-如何做需求验证.srt",
    );
  });

  it("去掉文件名非法字符", () => {
    const name = buildClipFileName(2, '路径/带:非法*字符?', "mp4");
    expect(name).toBe("02-路径带非法字符.mp4");
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });
});
