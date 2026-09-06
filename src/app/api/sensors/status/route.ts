import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const params = new URLSearchParams();
    if (query.get("include_history") === "false") params.set("include_history", "false");
    if (query.get("name")) params.set("name", query.get("name")!);
    const suffix = params.size ? `?${params}` : "";
    const data = await butlerGet(`/api/sensors/status${suffix}`);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
