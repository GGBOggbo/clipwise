import { describe, it, expect } from "vitest";
import {
  projects,
  projectFiles,
  transcriptSegments,
  clipCandidates,
  subtitleLines,
  jobs,
  exportArtifacts,
  highlightWindowScores,
} from "@/db/schema";

describe("drizzle schema 定义了 7 张表", () => {
  it("projects 表有 token 主键和必需字段", () => {
    expect(projects.token).toBeDefined();
    expect(projects.status).toBeDefined();
    expect(projects.videoConnectionStatus).toBeDefined();
    expect(projects.sourceFileName).toBeDefined();
    expect(projects.sourceFileSize).toBeDefined();
    expect(projects.durationMs).toBeDefined();
    expect(projects.expiresAt).toBeDefined();
    expect(projects.regenerationCount).toBeDefined();
  });

  it("jobs 表支持任务队列语义", () => {
    expect(jobs.taskId).toBeDefined();
    expect(jobs.type).toBeDefined();
    expect(jobs.status).toBeDefined();
    expect(jobs.progress).toBeDefined();
    expect(jobs.message).toBeDefined();
    expect(jobs.errorCode).toBeDefined();
  });

  it("candidates 和 subtitles 是 1:N 关系", () => {
    expect(clipCandidates.id).toBeDefined();
    expect(clipCandidates.projectToken).toBeDefined();
    expect(subtitleLines.candidateId).toBeDefined();
  });

  it("7 张表全部导出", () => {
    expect(projects).toBeDefined();
    expect(projectFiles).toBeDefined();
    expect(transcriptSegments).toBeDefined();
    expect(clipCandidates).toBeDefined();
    expect(subtitleLines).toBeDefined();
    expect(jobs).toBeDefined();
    expect(exportArtifacts).toBeDefined();
    expect(highlightWindowScores).toBeDefined();
  });

  it("defines editor recall fields on clip candidates", () => {
    expect(clipCandidates.recommendation).toBeDefined();
    expect(clipCandidates.topicLabel).toBeDefined();
    expect(clipCandidates.editingNote).toBeDefined();
    expect(clipCandidates.boundaryReason).toBeDefined();
    expect(clipCandidates.needsSetup).toBeDefined();
    expect(clipCandidates.rejectionReason).toBeDefined();
  });

  it("defines highlight window score audit table", () => {
    expect(highlightWindowScores.id).toBeDefined();
    expect(highlightWindowScores.projectToken).toBeDefined();
    expect(highlightWindowScores.windowId).toBeDefined();
    expect(highlightWindowScores.recommendation).toBeDefined();
    expect(highlightWindowScores.informationDensity).toBeDefined();
    expect(highlightWindowScores.hookStrength).toBeDefined();
    expect(highlightWindowScores.standaloneClarity).toBeDefined();
    expect(highlightWindowScores.editability).toBeDefined();
    expect(highlightWindowScores.selectionStatus).toBeDefined();
  });
});
