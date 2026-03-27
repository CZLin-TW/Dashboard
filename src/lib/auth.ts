import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.LINE_LOGIN_CHANNEL_SECRET ?? "dev-secret"
);

const COOKIE_NAME = "dashboard_session";

export interface SessionUser {
  lineUserId: string;
  name: string;
  picture?: string;
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
  return token;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      lineUserId: payload.lineUserId as string,
      name: payload.name as string,
      picture: payload.picture as string | undefined,
    };
  } catch {
    return null;
  }
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
