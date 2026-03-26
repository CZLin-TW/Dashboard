import { NextResponse } from "next/server";
import { getSheetData, appendSheetRow, updateSheetRow, deleteSheetRow } from "@/lib/sheets";

export async function GET() {
  try {
    const food = await getSheetData("食品庫存");
    return NextResponse.json(food);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const today = new Date().toISOString().split("T")[0];
    await appendSheetRow("食品庫存", [
      body.name,
      String(body.quantity),
      body.unit,
      body.expiry,
      today,
      body.addedBy,
      "有效",
    ]);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { index, values } = body;
    if (index === undefined || !values) {
      return NextResponse.json({ error: "missing index or values" }, { status: 400 });
    }
    await updateSheetRow("食品庫存", index, values);
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
    await deleteSheetRow("食品庫存", index);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
