import { describe, it, expect } from "vitest";
import { mapRowToProject } from "@/features/project-mapping";
import type { ClipwiseProject } from "@clipwise/shared";

describe("mapRowToProject", () => {
  it("把 DB 行映射成 ClipwiseProject，字段类型与 domain 一致", () => {
    const projectRows = [
      {
        token: "demo-project",
        status: "ready" as const,
        videoConnectionStatus: "missing" as const,
        sourceFileName: "test.mp4",
        sourceFileSize: 1000,
        durationMs: 60000,
        expiresAt: new Date("2026-06-29T23:59:59+08:00"),
        regenerationCount: 0,
      },
    ];
    const candidateRows = [
      {
        id: "c1",
        projectToken: "demo-project",
        rank: 1,
        finalScore: 90,
        type: "观点" as const,
        startMs: 0,
        endMs: 5000,
        durationMs: 5000,
        titleOptions: ["标题1", "标题2", "标题3"],
        selectedTitle: "标题1",
        summary: "摘要",
        quote: "金句",
        recommendationReason: "理由",
        riskNotices: [] as string[],
        previewStatus: "not_previewed" as const,
      },
    ];
    const subtitleRows = [
      {
        id: "c1-sub-1",
        candidateId: "c1",
        index: 0,
        startMs: 0,
        endMs: 5000,
        text: "金句",
      },
    ];

    const project = mapRowToProject({
      project: projectRows[0],
      candidates: candidateRows,
      subtitles: subtitleRows,
    });

    const expected: ClipwiseProject = {
      token: "demo-project",
      status: "ready",
      videoConnectionStatus: "missing",
      sourceFileName: "test.mp4",
      sourceFileSize: 1000,
      durationMs: 60000,
      expiresAt: "2026-06-29T15:59:59.000Z",
      regenerationCount: 0,
      candidates: [
        {
          id: "c1",
          rank: 1,
          finalScore: 90,
          type: "观点",
          startMs: 0,
          endMs: 5000,
          durationMs: 5000,
          titleOptions: ["标题1", "标题2", "标题3"],
          selectedTitle: "标题1",
          summary: "摘要",
          quote: "金句",
          recommendationReason: "理由",
          riskNotices: [],
          subtitles: [{ id: "c1-sub-1", startMs: 0, endMs: 5000, text: "金句" }],
          previewStatus: "not_previewed",
        },
      ],
    };
    expect(project).toEqual(expected);
  });

  it("expiresAt 输出 ISO 8601 带时区字符串", () => {
    const project = mapRowToProject({
      project: {
        token: "t",
        status: "ready",
        videoConnectionStatus: "missing",
        sourceFileName: null,
        sourceFileSize: null,
        durationMs: null,
        expiresAt: new Date("2026-06-29T15:59:59Z"),
        regenerationCount: 0,
      },
      candidates: [],
      subtitles: [],
    });
    expect(project.expiresAt).toBe("2026-06-29T15:59:59.000Z");
    expect(new Date(project.expiresAt).getTime()).not.toBeNaN();
  });
});
