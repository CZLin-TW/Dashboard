import { requestUser, requestError } from "@/lib/request-user";
import { NextResponse } from "next/server";
import { butlerGet, butlerPost, butlerPatch, butlerDelete } from "@/lib/butler";

export async function GET(request: Request) {
  try {
    const userId = await requestUser(request);
    const data = await butlerGet("/api/todos", userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requestUser(request);
    const body = await request.json();
    const data = await butlerPost("/api/todos", body, userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requestUser(request);
    const body = await request.json();
    const data = await butlerPatch("/api/todos", body, userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requestUser(request);
    const url = new URL(request.url);
    const item = url.searchParams.get("item") ?? "";
    const date_orig = url.searchParams.get("date_orig") ?? "";
    const time_orig = url.searchParams.get("time_orig") ?? "";
    const data = await butlerDelete("/api/todos", { item, date_orig, time_orig, todo_id: url.searchParams.get("todo_id") || undefined }, userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}
