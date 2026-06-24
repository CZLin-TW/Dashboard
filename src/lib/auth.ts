import { cookies } from "next/headers";
import { SignJWT } from "jose";
// secret 解析 + 驗證集中在 edge-safe 的 lib/jwt.ts，與 proxy.ts(middleware) 共用，
// 保證簽發與閘門驗簽用同一把金鑰。
import { JWT_SECRET, verifyToken, assertCanIssueSession, type SessionUser } from "./jwt";

const COOKIE_NAME = "dashboard_session";

// 兒童遙控器是固定 kiosk 裝置，不想每 7 天重配；member 維持原本 7 天。
// 取捨：純無狀態長效（不可遠端作廢），手機弄丟唯一補救是輪替 SESSION_JWT_SECRET（全家重登）。
const MEMBER_MAX_AGE = 60 * 60 * 24 * 7; // 7 天
const KID_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

function maxAgeFor(role: SessionUser["role"]): number {
  return role === "kid" ? KID_MAX_AGE : MEMBER_MAX_AGE;
}

export type { SessionUser };

export async function createSession(user: SessionUser): Promise<string> {
  assertCanIssueSession(); // production 缺 secret 時拒絕簽發（fail-closed）
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${maxAgeFor(user.role)}s`)
    .sign(JWT_SECRET);
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
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
    maxAge: maxAgeFor(role), // kid: 1 年；member: 7 天
  };
}
