import { NextResponse } from "next/server";
import { butlerGet, butlerPost, butlerPatch, butlerDelete } from "@/lib/butler";

// 週期性待辦模板 — 純 proxy 到 home-butler /api/recurring-todos。
// 詳細 schema + 行為見 home-butler/handlers/recurring_todo.py。
// 注意：實際「生成」由 home-butler 的 /notify_realtime tick 跑，且受後端
// RECURRING_TODO_ENABLED 總開關控制——前端建好的模板在開關關閉時只會靜置不生成。

export async function GET() {
  try {
    const data = await butlerGet("/api/recurring-todos");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await butlerPost("/api/recurring-todos", body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const data = await butlerPatch("/api/recurring-todos", body);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const rule_id = url.searchParams.get("rule_id") ?? "";
    const item = url.searchParams.get("item") ?? "";
    const recur_type = url.searchParams.get("recur_type") ?? "";
    const data = await butlerDelete("/api/recurring-todos", { rule_id, item, recur_type });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
