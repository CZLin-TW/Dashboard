import { requestError } from "@/lib/request-user";
import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "today";
  const location = url.searchParams.get("location") ?? "";

  try {
    const params = new URLSearchParams({ date });
    if (location) params.set("location", location);
    const data = await butlerGet(`/api/weather?${params}`);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}
