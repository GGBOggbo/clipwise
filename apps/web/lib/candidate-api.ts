import type { ClipCandidate } from "@clipwise/shared";

// 客户端调用：用相对路径，浏览器自动用当前 origin，避免硬编码端口。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

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
