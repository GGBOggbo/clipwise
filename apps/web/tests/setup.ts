import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// 全局 mock next/navigation，让渲染 ProjectWorkspace 的测试不需要各自 mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:clipwise-test";
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => undefined;
}
