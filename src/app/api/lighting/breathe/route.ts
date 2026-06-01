import { NextResponse } from "next/server";
import { butlerPost } from "@/lib/butler";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await butlerPost("/api/lighting/breathe", body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
