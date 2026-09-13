import { NextResponse } from "next/server";
import { requestUser, requestError } from "@/lib/request-user";
import { butlerGet } from "@/lib/butler";

export async function GET(request: Request) {
  try {
    await requestUser(request);
    const data = await butlerGet("/api/home-assistant/observations");
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    return requestError(err);
  }
}
