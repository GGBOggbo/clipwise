"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClipCandidate,
  ClipwiseProject,
  PreviewStatus,
} from "@clipwise/shared";
import { useProjectWorkspace } from "@/features/project-state/useProjectWorkspace";
import { CandidateList } from "./CandidateList";
import { EditorTabs } from "./EditorTabs";
import { LocalVideoPlayer } from "./LocalVideoPlayer";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectProgress } from "./ProjectProgress";
import { ProjectStateView } from "./ProjectStateView";
import styles from "./ProjectWorkspace.module.css";

type ProjectWorkspaceProps = {
  initialProject: ClipwiseProject;
};

export function ProjectWorkspace({ initialProject }: ProjectWorkspaceProps) {
  const workspace = useProjectWorkspace(initialProject);
  const router = useRouter();
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const candidate = workspace.selectedCandidate;

  const handleRegenerate = useCallback(async () => {
    setRetryError(null);
    const resp = await fetch(
      `${
        process.env.NEXT_PUBLIC_API_BASE ?? ""
      }/api/projects/${workspace.project.token}/regenerate`,
      { method: "POST" },
    );
    if (resp.ok) {
      const { taskId } = await resp.json();
      router.push(`/project/${workspace.project.token}/tasks/${taskId}`);
      return;
    }
    const body = await resp.json().catch(() => null);
    setRetryError(
      typeof body?.message === "string"
        ? body.message
        : "暂时无法从失败阶段重试，请重新上传视频。",
    );
  }, [router, workspace.project.token]);

  const changePreviewStatus = useCallback(
    (status: PreviewStatus) => {
      if (workspace.selectedCandidateId) {
        workspace.updatePreviewStatus(workspace.selectedCandidateId, status);
      }
    },
    [workspace],
  );

  function selectCandidate(id: string) {
    workspace.setSelectedCandidateId(id);
  }

  function previewCandidate(id: string) {
    workspace.setSelectedCandidateId(id);
  }

  function toggleDetails(id: string) {
    workspace.setExpandedCandidateId(
      workspace.expandedCandidateId === id ? null : id,
    );
  }

  function changeCandidate(nextCandidate: ClipCandidate) {
    workspace.updateCandidate(nextCandidate);
  }

  if (workspace.project.status !== "ready") {
    return (
      <ProjectStateView
        status={workspace.project.status}
        onRetry={handleRegenerate}
        retryError={retryError}
      />
    );
  }

  return (
    <div className={styles.shell}>
      <ProjectHeader
        candidateCount={workspace.project.candidates.length}
        sourceFileName={workspace.project.sourceFileName}
      />
      <ProjectProgress />

      <main className={styles.workspace}>
        <section className={styles.leftPanel}>
          <LocalVideoPlayer
            candidate={candidate}
            file={localFile}
            onFileChange={setLocalFile}
            onPreviewStatusChange={changePreviewStatus}
          />

          <div className={styles.clipInfo}>
            {candidate ? (
              <>
                <div className={styles.clipMeta}>
                  <span>当前片段</span>
                  <span>{candidate.type}</span>
                  <span>
                    {candidate.previewStatus === "previewed"
                      ? "已预览"
                      : candidate.previewStatus === "previewing"
                        ? "预览中"
                        : "尚未预览"}
                  </span>
                </div>
                <div className={styles.clipTitle}>
                  <strong>{candidate.selectedTitle}</strong>
                  <span>
                    {Math.round(candidate.durationMs / 1000)} 秒 ·{" "}
                    {candidate.topicLabel}
                  </span>
                </div>
              </>
            ) : (
              <span>尚未选择片段</span>
            )}
          </div>

          <EditorTabs
            candidate={candidate}
            candidates={workspace.candidates}
            file={localFile}
            videoConnected={Boolean(localFile)}
            onCandidateChange={changeCandidate}
            onRequestPreview={() => {
              if (candidate) previewCandidate(candidate.id);
            }}
            token={workspace.project.token}
          />
        </section>

        <CandidateList
          candidates={workspace.candidates}
          expandedId={workspace.expandedCandidateId}
          selectedId={workspace.selectedCandidateId}
          showAll={workspace.showAll}
          sort={workspace.sort}
          total={workspace.project.candidates.length}
          onPreview={previewCandidate}
          onSelect={selectCandidate}
          onSortChange={workspace.setSort}
          onToggleDetails={toggleDetails}
          onToggleShowAll={() => workspace.setShowAll(!workspace.showAll)}
          onRegenerate={handleRegenerate}
          canRegenerate={workspace.project.regenerationCount < 1}
        />
      </main>
    </div>
  );
}
