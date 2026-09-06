import { requestUser, requestError } from "@/lib/request-user";
import { NextResponse } from "next/server";
import { butlerGet, butlerPost, butlerPatch, butlerDelete } from "@/lib/butler";

// 週期性待辦模板 — 純 proxy 到 home-butler /api/recurring-todos。
// 詳細 schema + 行為見 home-butler/handlers/recurring_todo.py。
// 注意：實際「生成」由 home-butler in-process polling thread 的 realtime tick 跑
//（每 5 分鐘；/notify_realtime 端點現在只是手動 debug 觸發，不是正常驅動來源），
// 且受後端 RECURRING_TODO_ENABLED 總開關控制——前端建好的模板在開關關閉時只會靜置不生成。

export async function GET(request: Request) {
  try {
    const userId = await requestUser(request);
    const data = await butlerGet("/api/recurring-todos", userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requestUser(request);
    const body = await request.json();
    const data = await butlerPost("/api/recurring-todos", body, userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requestUser(request);
    const body = await request.json();
    const data = await butlerPatch("/api/recurring-todos", body, userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requestUser(request);
    const url = new URL(request.url);
    const rule_id = url.searchParams.get("rule_id") ?? "";
    const item = url.searchParams.get("item") ?? "";
    const recur_type = url.searchParams.get("recur_type") ?? "";
    const data = await butlerDelete("/api/recurring-todos", { rule_id, item, recur_type }, userId);
    return NextResponse.json(data);
  } catch (err: unknown) {
    return requestError(err);
  }
}
