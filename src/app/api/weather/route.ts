import { NextResponse } from "next/server";
import { getWeather } from "@/lib/weather";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city") ?? "臺北市";
  const location = url.searchParams.get("location") ?? undefined;

  try {
    const data = await getWeather(city, location);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
