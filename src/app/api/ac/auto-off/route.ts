import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

// 唯讀：後端對 Sheet 自動關機設定的解讀。設定本身仍只在 Sheet 改，這裡沒有寫入。
export async function GET() {
  try {
    const data = await butlerGet("/api/ac/auto-off");
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
