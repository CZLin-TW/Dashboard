import { NextResponse } from "next/server";
import { butlerGet, butlerPost, butlerPatch, butlerDelete } from "@/lib/butler";

export async function GET() {
  try {
    const data = await butlerGet("/api/todos");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await butlerPost("/api/todos", body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const data = await butlerPatch("/api/todos", body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const item = url.searchParams.get("item") ?? "";
    const date_orig = url.searchParams.get("date_orig") ?? "";
    const time_orig = url.searchParams.get("time_orig") ?? "";
    const data = await butlerDelete("/api/todos", { item, date_orig, time_orig });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
