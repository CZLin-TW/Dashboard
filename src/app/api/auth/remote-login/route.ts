import { NextResponse } from "next/server";
import { hb } from "@/lib/hb";
import { createSession, getSessionCookieOptions, REMOTE_USER_ID } from "@/lib/auth";
import { RequestError } from "@/lib/request-user";

// 遙控器模式：用共用密碼換取受限的 session（role "remote"）。在 /api/auth/* 之下，登入前可用。
// 密碼比對與連錯鎖定都在 HomeButler；這裡只在驗過後於本容器簽發 cookie，PWA 全程不離開容器。
export async function POST(request: Request) {
  let password = "";
  try {
    const body = await request.json();
    password = String(body?.password ?? "");
  } catch {
    /* 無 body / 非 JSON → 當空密碼，下面會被擋 */
  }
  try {
    const data = await hb("POST", "/v2/sign-in/remote", { body: { password } }) as { remote_id: number; name: string };
    const sessionToken = await createSession({ lineUserId: REMOTE_USER_ID, name: data.name || "遙控器", role: "remote", remoteId: data.remote_id });
    const res = NextResponse.json({ ok: true });
    const opts = getSessionCookieOptions("remote"); // 遙控器：14 天，有在用就延長
    res.cookies.set(opts.name, sessionToken, opts);
    return res;
  } catch (err: unknown) {
    const status = err instanceof RequestError ? err.status : 500;
    if (status === 429) return NextResponse.json({ ok: false, locked: true }, { status: 429 });
    if (status === 401 || status === 422) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: false, error: "暫時無法登入，請稍後再試。" }, { status: 503 });
  }
}
