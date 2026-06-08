import { NextResponse } from "next/server";
import { butlerPost } from "@/lib/butler";

// 裝置配對登入：向 home-butler 取得一組 user_code + device_token。
// 在 /api/auth/* 之下 → 已在 proxy.ts 的 PUBLIC_PATHS（登入前可用）。
export async function POST() {
  try {
    const data = await butlerPost("/api/auth/device/create", {});
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
