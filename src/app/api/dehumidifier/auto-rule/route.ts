import { NextResponse } from "next/server";
import { butlerGet, butlerPost } from "@/lib/butler";

// 除濕機條件式自動規則 — 純 proxy 到 home-butler
// 詳細 schema + 行為見 home-butler/dehumidifier_auto.py

export async function GET() {
  try {
    const data = await butlerGet("/api/dehumidifier/auto-rule");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await butlerPost("/api/dehumidifier/auto-rule", body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
