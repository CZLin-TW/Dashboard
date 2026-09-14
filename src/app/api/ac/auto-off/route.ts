import { NextResponse } from "next/server";
import { butlerGet, butlerPost } from "@/lib/butler";
import { requestError, requestUser } from "@/lib/request-user";

export async function GET(request: Request) {
  try {
    await requestUser(request);
    return NextResponse.json(await butlerGet("/api/ac/auto-off"));
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  try {
    await requestUser(request);
    return NextResponse.json(await butlerPost("/api/ac/auto-off", await request.json()));
  } catch (error) { return requestError(error); }
}
