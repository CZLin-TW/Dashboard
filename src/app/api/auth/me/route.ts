import { NextRequest, NextResponse } from "next/server";
import { createSession, getSession, getSessionCookieOptions, SESSION_RENEW_AFTER } from "@/lib/auth";
import { butlerGet } from "@/lib/butler";
import { isDemoMode } from "@/lib/demo/config";
import { verifySession } from "@/lib/jwt";

// 每次載入頁面都會打這支，所以 member session 的延長做在這裡：簽發超過一天就向後端確認
// 仍是啟用中的家庭成員，是的話重簽（期限重新起算），明確不是就清掉 cookie。
// 後端連不上或回錯誤時兩者都不做——不能因為後端暫時掛掉就把人登出，也不能在沒確認時延長。
export async function GET(request: Request) {
  if (isDemoMode()) return NextResponse.json(await getSession());
  const cookie = getSessionCookieOptions();
  const token = new NextRequest(request.url, { headers: request.headers }).cookies.get(cookie.name)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let user = session.user;
  const age = session.issuedAt === null ? Infinity : Date.now() / 1000 - session.issuedAt;
  if (user.role !== "kid" && age >= SESSION_RENEW_AFTER) {
    // 無法確認（連不上、回錯誤）就當沒有答案：維持現有 session，下次載入再試。
    const member = await butlerGet("/api/auth/member", user.lineUserId)
      .then((value) => value as { active?: unknown; name?: unknown } | null)
      .catch(() => null);
    if (member?.active === false) {
      const denied = NextResponse.json({ error: "unauthorized" }, { status: 401 });
      denied.cookies.delete(cookie.name);
      return denied;
    }
    if (member?.active === true) {
      if (typeof member.name === "string" && member.name) user = { ...user, name: member.name };
      const renewed = NextResponse.json(user);
      const options = getSessionCookieOptions(user.role);
      renewed.cookies.set(options.name, await createSession(user), options);
      return renewed;
    }
  }
  return NextResponse.json(user);
}
