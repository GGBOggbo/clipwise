import { describe, it, expect } from "vitest";
import { generateProjectToken } from "@/lib/token";

describe("generateProjectToken", () => {
  it("返回足够长的随机字符串（>= 32 字符）", () => {
    const token = generateProjectToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("两次调用结果不同", () => {
    const a = generateProjectToken();
    const b = generateProjectToken();
    expect(a).not.toBe(b);
  });

  it("只含 URL 安全字符", () => {
    const token = generateProjectToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
