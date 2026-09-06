import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET(request: Request) {
  try {
    const light = new URL(request.url).searchParams.get("include_weather") === "false";
    const data = await butlerGet(light ? "/api/dashboard?include_weather=false" : "/api/dashboard");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
