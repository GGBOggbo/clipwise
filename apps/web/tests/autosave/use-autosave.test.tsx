import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutosave } from "@/features/autosave/useAutosave";

describe("useAutosave", () => {
  it("修改后先变 dirty，500ms 后保存", async () => {
    vi.useFakeTimers();
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, 500));

    act(() => result.current.schedule({ title: "新标题" }));
    expect(result.current.status).toBe("dirty");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(save).toHaveBeenCalledWith({ title: "新标题" });
    expect(result.current.status).toBe("saved");
    vi.useRealTimers();
  });
});
