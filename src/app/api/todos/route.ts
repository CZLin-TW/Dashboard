import { NextResponse } from "next/server";
import { getSheetData, appendSheetRow, deleteSheetRow } from "@/lib/sheets";

export async function GET() {
  try {
    const todos = await getSheetData("待辦事項");
    return NextResponse.json(todos);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { item, date, time, person, type } = body;
    // Append: match sheet column order from home-butler
    await appendSheetRow("待辦事項", [item, date, time ?? "", person, type ?? "其他", ""]);
    return NextResponse.json({ ok: true });
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
    await deleteSheetRow("待辦事項", index);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
