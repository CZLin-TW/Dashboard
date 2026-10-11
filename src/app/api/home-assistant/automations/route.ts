import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

// 唯讀：HA 的自動化清單與最近的執行記錄。沒有寫入，也不會有——Dashboard 不編輯 HA 自動化。
// 遙控器也看得到（在 proxy.ts 的白名單），因為「為什麼它自己動了」正是在裝置頁會問的問題。
export async function GET() {
  try {
    const data = await butlerGet("/api/home-assistant/automations");
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
