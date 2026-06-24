import { NextResponse } from "next/server";
import { butlerPost } from "@/lib/butler";

// 裝置配對登入：向 home-butler 取得一組 user_code + device_token。
// 在 /api/auth/* 之下 → 已在 proxy.ts 的 PUBLIC_PATHS（登入前可用）。
// body.kid=true（兒童入口 ?kid=1）→ 配對在產生時就標記 kid，角色綁在這台裝置上。
export async function POST(request: Request) {
  try {
    let kid = false;
    try {
      const body = await request.json();
      kid = body?.kid === true;
    } catch {
      /* 無 body / 非 JSON → 當一般成員配對 */
    }
    const data = await butlerPost("/api/auth/device/create", { kid });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
