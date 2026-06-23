import { describe, it, expect } from "vitest";
import {
  shouldAdvanceProgress,
  isTerminal,
  isCompleted,
  isFailed,
} from "@/features/task-progress/task-progress-machine";

describe("task-progress-machine", () => {
  it("进度只能单调递增，不倒退", () => {
    expect(shouldAdvanceProgress(50, 70)).toBe(true);
    expect(shouldAdvanceProgress(70, 50)).toBe(false);
    expect(shouldAdvanceProgress(70, 70)).toBe(false);
  });

  it("终态判定", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("pending")).toBe(false);
  });

  it("completed / failed 区分", () => {
    expect(isCompleted("succeeded")).toBe(true);
    expect(isFailed("failed")).toBe(true);
    expect(isCompleted("failed")).toBe(false);
    expect(isFailed("succeeded")).toBe(false);
  });
});
