import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// SESSION_JWT_SECRET should be a dedicated random value (e.g. `openssl rand -hex 32`),
// kept separate from LINE_LOGIN_CHANNEL_SECRET so:
//   - Rotating the LINE Channel Secret doesn't invalidate active sessions
//   - A leak of one secret doesn't compromise the other
// Falls back to LINE_LOGIN_CHANNEL_SECRET for backward compat with existing deployments,
// then to a dev-only literal so local dev still works without env setup.
const SECRET_SOURCE =
  process.env.SESSION_JWT_SECRET ??
  process.env.LINE_LOGIN_CHANNEL_SECRET ??
  "dev-secret";

const JWT_SECRET = new TextEncoder().encode(SECRET_SOURCE);

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
