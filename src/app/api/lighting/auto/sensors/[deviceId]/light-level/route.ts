import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  try {
    const { deviceId } = await params;
    const data = await butlerGet(`/api/lighting/auto/sensors/${encodeURIComponent(deviceId)}/light-level`);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
