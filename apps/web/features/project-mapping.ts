import type {
  ClipCandidate,
  ClipwiseProject,
  SubtitleLine,
} from "@clipwise/shared";

type ProjectRow = {
  token: string;
  status: ClipwiseProject["status"];
  videoConnectionStatus: ClipwiseProject["videoConnectionStatus"];
  sourceFileName: string | null;
  sourceFileSize: number | null;
  durationMs: number | null;
  expiresAt: Date;
  regenerationCount: number;
};

type CandidateRow = {
  id: string;
  projectToken: string;
  rank: number;
  finalScore: number;
  type: ClipCandidate["type"];
  startMs: number;
  endMs: number;
  durationMs: number;
  titleOptions: string[];
  selectedTitle: string;
  summary: string;
  quote: string;
  recommendationReason: string;
  riskNotices: string[];
  previewStatus: ClipCandidate["previewStatus"];
};

type SubtitleRow = {
  id: string;
  candidateId: string;
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

export function mapRowToProject(args: {
  project: ProjectRow;
  candidates: CandidateRow[];
  subtitles: SubtitleRow[];
}): ClipwiseProject {
  const { project, candidates, subtitles } = args;
  const sortedCandidates = [...candidates].sort((a, b) => a.rank - b.rank);

  const mappedCandidates: ClipCandidate[] = sortedCandidates.map((c) => {
    const candidateSubtitles: SubtitleLine[] = subtitles
      .filter((s) => s.candidateId === c.id)
      .sort((a, b) => a.index - b.index)
      .map((s) => ({
        id: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
      }));

    return {
      id: c.id,
      rank: c.rank,
      finalScore: c.finalScore,
      type: c.type,
      startMs: c.startMs,
      endMs: c.endMs,
      durationMs: c.durationMs,
      titleOptions: [c.titleOptions[0], c.titleOptions[1], c.titleOptions[2]],
      selectedTitle: c.selectedTitle,
      summary: c.summary,
      quote: c.quote,
      recommendationReason: c.recommendationReason,
      riskNotices: c.riskNotices,
      subtitles: candidateSubtitles,
      previewStatus: c.previewStatus,
    };
  });

  return {
    token: project.token,
    status: project.status,
    videoConnectionStatus: project.videoConnectionStatus,
    sourceFileName: project.sourceFileName ?? "",
    sourceFileSize: project.sourceFileSize ?? 0,
    durationMs: project.durationMs ?? 0,
    expiresAt: project.expiresAt.toISOString(),
    regenerationCount: project.regenerationCount,
    candidates: mappedCandidates,
  };
}
