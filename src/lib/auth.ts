import { cookies } from "next/headers";
import { SignJWT } from "jose";
// secret 解析 + 驗證集中在 edge-safe 的 lib/jwt.ts，與 proxy.ts(middleware) 共用，
// 保證簽發與閘門驗簽用同一把金鑰。
import { JWT_SECRET, verifyToken, assertCanIssueSession, type SessionUser } from "./jwt";

const COOKIE_NAME = "dashboard_session";

export type { SessionUser };

export async function createSession(user: SessionUser): Promise<string> {
  assertCanIssueSession(); // production 缺 secret 時拒絕簽發（fail-closed）
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  return verifyToken(cookieStore.get(COOKIE_NAME)?.value);
}

export function getSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}
