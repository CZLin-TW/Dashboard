import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

// 除濕機 ON/OFF 歷史 — 純 proxy 到 home-butler
// 只在自動模式 ON 的除濕機才有資料（home-butler/dehumidifier_history.py 只在
// auto_mode polling tick 內 record）

export async function GET() {
  try {
    const data = await butlerGet("/api/dehumidifier/history");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
