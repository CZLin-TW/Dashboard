import { NextResponse } from "next/server";
import { getSheetData, deleteSheetRow } from "@/lib/sheets";

export async function GET() {
  try {
    const schedules = await getSheetData("排程指令");
    return NextResponse.json(schedules);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const index = parseInt(url.searchParams.get("index") ?? "-1");
    if (index < 0) {
      return NextResponse.json({ error: "missing index" }, { status: 400 });
    }
    await deleteSheetRow("排程指令", index);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
