import { cookies } from "next/headers";
import { isDemoMode, DEMO_USER } from "./demo/config";
import { SignJWT } from "jose";
// secret 解析 + 驗證集中在 edge-safe 的 lib/jwt.ts，與 proxy.ts(middleware) 共用，
// 保證簽發與閘門驗簽用同一把金鑰。
import { JWT_SECRET, verifyToken, assertCanIssueSession, type SessionUser } from "./jwt";

const COOKIE_NAME = "dashboard_session";

// member：90 天，而且有在用就延長（/api/auth/me 每天最多重簽一次，見該路由）。常用的裝置
// 因此不必重登；放著 90 天沒開的才會過期。重簽前會向後端確認仍是啟用中的家庭成員，
// 所以在試算表停用某位成員後，他的裝置最慢一天內失效——這是成員 session 唯一的遠端作廢途徑
// （另一個是輪替 SESSION_JWT_SECRET，全家重登）。
// 兒童遙控器是固定 kiosk 裝置：1 年、不延長，也沒有對應的成員可以查。
const MEMBER_MAX_AGE = 60 * 60 * 24 * 90; // 90 天
const KID_MAX_AGE = 60 * 60 * 24 * 365; // 1 年
/** member session 簽發超過這麼久就重簽一次（同時重新確認成員資格）。 */
export const SESSION_RENEW_AFTER = 60 * 60 * 24; // 1 天

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
    maxAge: maxAgeFor(role), // kid: 1 年；member: 90 天
  };
}
