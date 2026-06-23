"use client";

import { useCallback, useState } from "react";
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
  const [localFile, setLocalFile] = useState<File | null>(null);
  const candidate = workspace.selectedCandidate;

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
    return <ProjectStateView status={workspace.project.status} />;
  }

  return (
    <div className={styles.shell}>
      <ProjectHeader />
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
                <div>
                  <span>{candidate.type}</span>
                  <span>
                    {candidate.previewStatus === "previewed"
                      ? "已预览"
                      : candidate.previewStatus === "previewing"
                        ? "预览中"
                        : "尚未预览"}
                  </span>
                </div>
                <strong>{candidate.selectedTitle}</strong>
              </>
            ) : (
              <span>尚未选择片段</span>
            )}
          </div>

          <EditorTabs
            candidate={candidate}
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
        />
      </main>
    </div>
  );
}
