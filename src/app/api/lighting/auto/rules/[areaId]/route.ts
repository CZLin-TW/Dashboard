import { NextResponse } from "next/server";
import { butlerDelete, butlerPatch } from "@/lib/butler";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ areaId: string }> },
) {
  try {
    const { areaId } = await params;
    const body = await request.json();
    const data = await butlerPatch(`/api/lighting/auto/rules/${encodeURIComponent(areaId)}`, body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ areaId: string }> },
) {
  try {
    const { areaId } = await params;
    const data = await butlerDelete(`/api/lighting/auto/rules/${encodeURIComponent(areaId)}`, undefined);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
