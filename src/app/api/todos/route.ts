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
    // Columns: 事項, 日期, 時間, 負責人, 狀態, 類型, 來源, 屬性
    await appendSheetRow("待辦事項", [
      body.item,
      body.date,
      body.time ?? "",
      body.person,
      "待辦",
      body.type ?? "私人",
      "本地",
      "讀寫",
    ]);
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
