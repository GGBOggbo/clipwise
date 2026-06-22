import { NextResponse } from "next/server";

export async function GET() {
  // Phase 3 将实现 SSE 流：每秒查询 jobs 表推送 TaskProgressEvent
  return NextResponse.json(
    { error: "sse_not_implemented", message: "SSE 将在 Phase 3 实现" },
    { status: 501 },
  );
}
