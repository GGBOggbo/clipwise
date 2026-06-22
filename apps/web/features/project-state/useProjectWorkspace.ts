"use client";

import { useMemo, useState } from "react";
import type {
  ClipCandidate,
  ClipwiseProject,
  PreviewStatus,
} from "@clipwise/shared";

export type CandidateSort = "rank" | "time";

export function useProjectWorkspace(initialProject: ClipwiseProject) {
  const [project, setProject] = useState(initialProject);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(
    null,
  );
  const [sort, setSort] = useState<CandidateSort>("rank");
  const [showAll, setShowAll] = useState(false);

  const candidates = useMemo(() => {
    const source = showAll
      ? [...project.candidates]
      : project.candidates.slice(0, 5);

    return source.sort((a, b) =>
      sort === "rank" ? a.rank - b.rank : a.startMs - b.startMs,
    );
  }, [project.candidates, showAll, sort]);

  const selectedCandidate =
    project.candidates.find(({ id }) => id === selectedCandidateId) ?? null;

  function updateCandidate(candidate: ClipCandidate) {
    setProject((current) => ({
      ...current,
      candidates: current.candidates.map((item) =>
        item.id === candidate.id ? candidate : item,
      ),
    }));
  }

  function updatePreviewStatus(id: string, previewStatus: PreviewStatus) {
    setProject((current) => ({
      ...current,
      candidates: current.candidates.map((candidate) =>
        candidate.id === id ? { ...candidate, previewStatus } : candidate,
      ),
    }));
  }

  return {
    project,
    setProject,
    candidates,
    selectedCandidate,
    selectedCandidateId,
    setSelectedCandidateId,
    expandedCandidateId,
    setExpandedCandidateId,
    sort,
    setSort,
    showAll,
    setShowAll,
    updateCandidate,
    updatePreviewStatus,
  };
}
