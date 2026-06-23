import type { ClipCandidate } from "@clipwise/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";

export async function patchCandidate(
  token: string,
  candidate: ClipCandidate,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/projects/${token}/candidates/${candidate.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedTitle: candidate.selectedTitle,
        titleOptions: candidate.titleOptions,
        summary: candidate.summary,
        quote: candidate.quote,
        riskNotices: candidate.riskNotices,
        previewStatus: candidate.previewStatus,
        subtitles: candidate.subtitles.map((s) => ({ id: s.id, text: s.text })),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`patch_candidate_failed: ${response.status}`);
  }
}
