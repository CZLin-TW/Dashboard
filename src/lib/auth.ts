import { cookies } from "next/headers";
import { isDemoMode, DEMO_USER } from "./demo/config";
import { SignJWT } from "jose";
// secret 解析 + 驗證集中在 edge-safe 的 lib/jwt.ts，與 proxy.ts(middleware) 共用，
// 保證簽發與閘門驗簽用同一把金鑰。
import { JWT_SECRET, verifyToken, assertCanIssueSession, type SessionUser } from "./jwt";

const COOKIE_NAME = "dashboard_session";

// 兩種身分都是滑動效期：有在用就延長（/api/auth/me 每天最多重簽一次，見該路由），
// 放著超過期限沒開的才要重登。重簽前向後端確認資格，所以在試算表停用之後最慢一天內失效；
// 另一個作廢途徑是輪替 SESSION_JWT_SECRET（全家重登）。
// - member（家庭成員）：30 天；資格＝「家庭成員」分頁中啟用。
// - kid（遙控器，受限身分；role 的值沿用舊名）：14 天；資格＝「遙控器」分頁那一列仍啟用。
const MEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 天
const KID_MAX_AGE = 60 * 60 * 24 * 14; // 14 天
/** session 簽發超過這麼久就重簽一次（同時重新確認資格）。 */
export const SESSION_RENEW_AFTER = 60 * 60 * 24; // 1 天
/** 遙控器 session 的 lineUserId；它不是任何成員。 */
export const REMOTE_USER_ID = "remote";

function maxAgeFor(role: SessionUser["role"]): number {
  return role === "kid" ? KID_MAX_AGE : MEMBER_MAX_AGE;
}

export type { SessionUser };

export async function createSession(user: SessionUser): Promise<string> {
  assertCanIssueSession(); // production 缺 secret 時拒絕簽發（fail-closed）
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeFor(user.role)}s`)
    .sign(JWT_SECRET);
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  if (isDemoMode()) return DEMO_USER; // no JWT is ever issued for this synthetic identity
  const cookieStore = await cookies();
  return verifyToken(cookieStore.get(COOKIE_NAME)?.value);
}

export function getSessionCookieOptions(role?: SessionUser["role"]) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeFor(role), // kid（遙控器）: 14 天；member: 30 天
  };
}
