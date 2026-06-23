// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTaskProgress } from "@/features/task-progress/useTaskProgress";

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, EventListener[]> = {};
  readyState = 0;
  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: EventListener) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners[type] = this.listeners[type]?.filter((l) => l !== listener) ?? [];
  }
  emit(type: string, data: unknown) {
    const event = new Event(type);
    (event as Event & { data: string }).data = JSON.stringify(data);
    this.listeners[type]?.forEach((l) => l(event as Event));
  }
  emitError() {
    this.readyState = 2;
    this.listeners.error?.forEach((l) => l(new Event("error")));
  }
  close = vi.fn(() => {
    this.readyState = 2;
  });
}

beforeEach(() => {
  MockEventSource.instances = [];
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    MockEventSource as unknown as typeof EventSource;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTaskProgress", () => {
  it("建立 SSE 连接并接收 progress 事件", async () => {
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      useTaskProgress({ taskId: "t1", projectToken: "p1", onCompleted }),
    );

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });

    const sse = MockEventSource.instances[0];
    act(() => {
      sse.emit("progress", {
        taskId: "t1",
        status: "running",
        progress: 40,
        message: "正在分析内容",
      });
    });

    expect(result.current.progress).toBe(40);
    expect(result.current.message).toBe("正在分析内容");
    expect(result.current.status).toBe("running");
  });

  it("进度不倒退", async () => {
    const { result } = renderHook(() =>
      useTaskProgress({ taskId: "t2", projectToken: "p2", onCompleted: vi.fn() }),
    );
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const sse = MockEventSource.instances[0];

    act(() =>
      sse.emit("progress", {
        status: "running",
        progress: 70,
        message: "a",
        taskId: "t2",
        updatedAt: "",
      }),
    );
    act(() =>
      sse.emit("progress", {
        status: "running",
        progress: 50,
        message: "b",
        taskId: "t2",
        updatedAt: "",
      }),
    );

    expect(result.current.progress).toBe(70);
  });

  it("completed 事件触发 onCompleted 并关闭连接", async () => {
    const onCompleted = vi.fn();
    renderHook(() =>
      useTaskProgress({ taskId: "t3", projectToken: "p3", onCompleted }),
    );
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const sse = MockEventSource.instances[0];

    act(() =>
      sse.emit("completed", {
        status: "succeeded",
        progress: 100,
        message: "完成",
        taskId: "t3",
        updatedAt: "",
      }),
    );

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(sse.close).toHaveBeenCalled();
  });

  it("SSE error 后静默超时启用轮询兜底", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "running",
        progress: 30,
        message: "轮询中",
        taskId: "t4",
        updatedAt: "",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useTaskProgress({
        taskId: "t4",
        projectToken: "p4",
        onCompleted: vi.fn(),
        silenceThresholdMs: 50,
        pollIntervalMs: 20,
      }),
    );
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    const sse = MockEventSource.instances[0];

    act(() => sse.emitError());
    // 静默超时（50ms）触发兜底，等待 fetch 被调用
    await waitFor(
      () => {
        expect(result.current.isPolling).toBe(true);
      },
      { timeout: 2000 },
    );
    expect(fetchMock).toHaveBeenCalled();
  });
});
