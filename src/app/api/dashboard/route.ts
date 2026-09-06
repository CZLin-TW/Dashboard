import { requestUser, requestError } from "@/lib/request-user";
import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

export async function GET(request: Request) {
  try {
    const userId = await requestUser(request);
    const light = new URL(request.url).searchParams.get("include_weather") === "false";
    const data = await butlerGet(light ? "/api/dashboard?include_weather=false" : "/api/dashboard", userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}
