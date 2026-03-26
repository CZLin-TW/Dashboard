import { NextResponse } from "next/server";
import { butlerGet, butlerDelete } from "@/lib/butler";

export async function GET() {
  try {
    const data = await butlerGet("/api/schedules");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const data = await butlerDelete("/api/schedules", body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
