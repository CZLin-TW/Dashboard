import { NextResponse } from "next/server";
import { hb } from "@/lib/hb";

// 裝置配對登入：向 HomeButler 取得一組六位數字＋只有這個瀏覽器保管的 device_token。
// 在 /api/auth/* 之下，登入前可用。配對只產生成員身分；遙控器走 /api/auth/remote-login。
export async function POST() {
  try {
    return NextResponse.json(await hb("POST", "/v2/pairing"));
  } catch {
    return NextResponse.json({ error: "暫時無法取得驗證碼，請稍後再試。" }, { status: 503 });
  }
}
