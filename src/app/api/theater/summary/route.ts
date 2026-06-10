import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET() {
  try {
    const data = await butlerGet("/api/theater/summary");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // theater agent 離線時 home-butler 回 503/504；前端把任何非 2xx 視為 offline。
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
