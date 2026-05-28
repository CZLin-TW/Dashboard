import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");
    // 帶 name=X → 只查該裝置（給樂觀更新 polling 用，不被其他雲端慢的裝置拖累）
    const path = name
      ? `/api/devices/status?name=${encodeURIComponent(name)}`
      : "/api/devices/status";
    const data = await butlerGet(path);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
