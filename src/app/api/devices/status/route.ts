import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");
    const nocache = searchParams.get("nocache");
    // name → 只查該裝置（給樂觀更新 polling 用，不被其他雲端慢的裝置拖累）
    // nocache → 跳過 home-butler status_cache，給樂觀 polling 用，避免 stale 鎖死
    const qs = new URLSearchParams();
    if (name) qs.set("name", name);
    if (nocache) qs.set("nocache", "1");
    const path = qs.toString()
      ? `/api/devices/status?${qs.toString()}`
      : "/api/devices/status";
    const data = await butlerGet(path);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
