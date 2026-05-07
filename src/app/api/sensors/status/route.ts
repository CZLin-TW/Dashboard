import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET() {
  try {
    const data = await butlerGet("/api/sensors/status");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
