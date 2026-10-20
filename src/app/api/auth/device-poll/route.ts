import { NextResponse } from "next/server";
import { hb } from "@/lib/hb";
import { createSession, getSessionCookieOptions } from "@/lib/auth";

interface Collected {
  status: string;
  user?: { lineUserId: string; name: string; picture?: string; role?: string };
}

// PWA 輪詢配對狀態。HomeButler 回 approved 時就在這個容器直接發 session cookie（不跳 Safari）。
// device_token 放在 POST 內容送給 HomeButler，不出現在任何網址或記錄裡。
export async function POST(request: Request) {
  try {
    let token = "";
    try { token = String((await request.json())?.token ?? ""); } catch { /* empty body */ }
    const data = await hb("POST", "/v2/pairing/collect", { body: { device_token: token } }) as Collected;
    if (data?.status === "approved" && data.user) {
      // 配對只發成員身分。後端若回了別的角色（不該發生），寧可不登入也不要發錯權限。
      if (data.user.role && data.user.role !== "member") return NextResponse.json({ status: "error" }, { status: 500 });
      const sessionToken = await createSession({ lineUserId: data.user.lineUserId, name: data.user.name,
        picture: data.user.picture || undefined, role: "member" });
      const res = NextResponse.json({ status: "approved", role: "member" });
      const opts = getSessionCookieOptions("member");
      res.cookies.set(opts.name, sessionToken, opts);
      return res;
    }
    return NextResponse.json({ status: data?.status ?? "pending" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
