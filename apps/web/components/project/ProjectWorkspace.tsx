"use client";

import type { ClipwiseProject } from "@clipwise/shared";
import { useProjectWorkspace } from "@/features/project-state/useProjectWorkspace";
import { CandidateList } from "./CandidateList";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectProgress } from "./ProjectProgress";
import styles from "./ProjectWorkspace.module.css";

type ProjectWorkspaceProps = {
  initialProject: ClipwiseProject;
};

export function ProjectWorkspace({ initialProject }: ProjectWorkspaceProps) {
  const workspace = useProjectWorkspace(initialProject);
  const candidate = workspace.selectedCandidate;

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

  return (
    <div className={styles.shell}>
      <ProjectHeader />
      <ProjectProgress />

      <main className={styles.workspace}>
        <section className={styles.leftPanel}>
          <div className={styles.player}>
            {candidate ? (
              <div className={styles.playerSelected}>
                <span>当前片段</span>
                <strong>{candidate.selectedTitle}</strong>
                <p>尚未预览</p>
                <button type="button">播放该片段</button>
              </div>
            ) : (
              <div className={styles.playerEmpty}>
                <span aria-hidden="true">▶</span>
                <p>从右侧选择一个候选片段，开始预览和编辑。</p>
              </div>
            )}
          </div>

          <div className={styles.clipInfo}>
            {candidate ? (
              <>
                <div>
                  <span>{candidate.type}</span>
                  <span>尚未预览</span>
                </div>
                <strong>{candidate.selectedTitle}</strong>
              </>
            ) : (
              <span>尚未选择片段</span>
            )}
          </div>

          <nav className={styles.tabs} aria-label="片段编辑">
            <button className={styles.tabActive} type="button">
              文案
            </button>
            <button type="button">字幕</button>
            <button type="button">导出</button>
          </nav>

          <div className={styles.editor}>
            {candidate ? (
              <div className={styles.editorPreview}>
                <label>
                  标题
                  <input value={candidate.selectedTitle} readOnly />
                </label>
                <label>
                  摘要
                  <textarea value={candidate.summary} readOnly />
                </label>
              </div>
            ) : (
              <p>选择一个候选片段后即可编辑文案。</p>
            )}
          </div>
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
