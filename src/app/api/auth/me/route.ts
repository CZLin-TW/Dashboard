import { NextRequest, NextResponse } from "next/server";
import { createSession, getSession, getSessionCookieOptions, SESSION_RENEW_AFTER } from "@/lib/auth";
import { hb } from "@/lib/hb";
import { isDemoMode } from "@/lib/demo/config";
import { verifySession, type SessionUser } from "@/lib/jwt";

type Standing = { active?: unknown; name?: unknown } | null;

/** 向後端問這個身分還算不算數。連不上或回錯誤一律當「沒有答案」（null）。 */
async function standing(user: SessionUser): Promise<Standing> {
  if (user.role !== "kid") {
    return hb("POST", "/v2/sign-in/member", { body: { line_user_id: user.lineUserId } }).then((v) => v as Standing).catch(() => null);
  }
  // 受限身分只有遙控器密碼一條路；沒有遙控器編號的是 v2 之前簽的 session，請重新以密碼登入。
  if (!user.remoteId) return { active: false };
  return hb("GET", `/v2/sign-in/remote/${user.remoteId}`).then((v) => v as Standing).catch(() => null);
}

// 載入頁面與開著的頁面定期都會打這支，所以 session 的延長做在這裡：簽發超過一天就向後端確認
// 資格（成員仍啟用／遙控器那一列仍啟用），是的話重簽（期限重新起算），明確不是就清掉 cookie。
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
  if (age >= SESSION_RENEW_AFTER) {
    const answer = await standing(user);
    if (answer?.active === false) {
      const denied = NextResponse.json({ error: "unauthorized" }, { status: 401 });
      denied.cookies.delete(cookie.name);
      return denied;
    }
    if (answer?.active === true) {
      // 成員改名後跟著名單走；遙控器的名稱就是查詢用的鍵，不會變。
      if (user.role !== "kid" && typeof answer.name === "string" && answer.name) user = { ...user, name: answer.name };
      const renewed = NextResponse.json(user);
      const options = getSessionCookieOptions(user.role);
      renewed.cookies.set(options.name, await createSession(user), options);
      return renewed;
    }
  }
  return NextResponse.json(user);
}
