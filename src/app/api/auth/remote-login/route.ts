import { NextResponse } from "next/server";
import { butlerPost } from "@/lib/butler";
import { createSession, getSessionCookieOptions } from "@/lib/auth";

// 遙控器模式：用共用密碼換取受限的 kid session（不需 LINE / 不需家長核准）。
// 在 /api/auth/* 之下 → 已在 proxy.ts 的 PUBLIC_PATHS（登入前可用）。
// 密碼比對 + 連錯鎖定都在 home-butler 端（讀「遙控器」分頁），這裡只負責在驗過後
// 於本容器簽發 session cookie——跟裝置配對一樣，PWA 全程不離開容器。
interface RemoteVerifyResult {
  ok?: boolean;
  user?: { name?: string; role?: string };
  locked?: boolean;
  retry_after?: number;
}

export async function POST(request: Request) {
  try {
    let password = "";
    try {
      const body = await request.json();
      password = String(body?.password ?? "");
    } catch {
      /* 無 body / 非 JSON → 當空密碼，下面會被擋 */
    }

    const data = (await butlerPost("/api/auth/remote/verify", { password })) as RemoteVerifyResult;

    if (data?.ok && data.user) {
      const sessionToken = await createSession({
        lineUserId: "remote",
        name: data.user.name || "遙控器",
        role: "kid",
      });
      const res = NextResponse.json({ ok: true });
      const opts = getSessionCookieOptions("kid"); // kid：長效 1 年
      res.cookies.set(opts.name, sessionToken, opts);
      return res;
    }

    if (data?.locked) {
      return NextResponse.json(
        { ok: false, locked: true, retry_after: data.retry_after ?? 0 },
        { status: 429 },
      );
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
