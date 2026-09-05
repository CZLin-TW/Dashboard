/** Server-only switch: never derive demo access from a URL, cookie or client header. */
export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DASHBOARD_DEMO_MODE !== "1") return false;
  if (env.VERCEL_ENV === "production") {
    throw new Error("Demo mode must use a separate local or Preview deployment.");
  }
  if (env.HOME_BUTLER_API_KEY || env.SESSION_JWT_SECRET || env.LINE_LOGIN_CHANNEL_SECRET) {
    throw new Error("Remove real backend and session credentials from the demo deployment.");
  }
  return true;
}

export const DEMO_USER = { lineUserId: "demo-local-only", name: "測試成員", role: "member" as const };
