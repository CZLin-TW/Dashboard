import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";
import { createSession, getSessionCookieOptions } from "@/lib/auth";

interface DeviceStatus {
  status: string;
  user?: { lineUserId: string; name: string; picture?: string };
}

// PWA 輪詢配對狀態。一旦 home-butler 回 approved，就在「這個容器」直接發 session
// cookie——PWA 全程不離開容器（不跳 Safari），這正是解決 iOS PWA 登入的關鍵。
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const data = (await butlerGet(
      `/api/auth/device/status?token=${encodeURIComponent(token)}`,
    )) as DeviceStatus;

    if (data?.status === "approved" && data.user) {
      const sessionToken = await createSession({
        lineUserId: data.user.lineUserId,
        name: data.user.name,
        picture: data.user.picture || undefined,
      });
      const res = NextResponse.json({ status: "approved" });
      const opts = getSessionCookieOptions();
      res.cookies.set(opts.name, sessionToken, opts);
      return res;
    }
    return NextResponse.json({ status: data?.status ?? "pending" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: msg }, { status: 500 });
  }
}
