import { SignJWT } from "jose";
import { isDemoMode } from "./demo/config";
import { RequestError } from "./request-user";
import type { SessionUser } from "./jwt";

// HomeButler's /v2 API. The Dashboard's own key says "this is the Dashboard"; a short-lived signed
// assertion says on whose behalf (a member by LINE id, or a remote tablet by its id). Both live only on
// this server — the browser never sees them.
// Read on each call, so a missing setting fails that request clearly instead of signing with an empty key.
function config() {
  const key = process.env.HOME_BUTLER_DASHBOARD_KEY ?? "";
  if (!key) throw new RequestError("Dashboard 尚未設定 HomeButler 的金鑰。", 503);
  return { base: process.env.HOME_BUTLER_URL ?? "https://home-butler.onrender.com", key };
}

function assertionKey(): Uint8Array {
  const value = process.env.DASHBOARD_ASSERTION_KEY ?? "";
  if (value.length < 32) throw new RequestError("Dashboard 尚未設定簽署身分用的金鑰。", 503);
  return new TextEncoder().encode(value);
}

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Who the request is for, as HomeButler names it. */
export function subject(user: SessionUser): { sub: string; role: "member" | "remote" } | null {
  if (user.role === "remote") return user.remoteId ? { sub: String(user.remoteId), role: "remote" } : null;
  return user.lineUserId ? { sub: user.lineUserId, role: "member" } : null;
}

export async function assertion(user: SessionUser): Promise<string> {
  const who = subject(user);
  if (!who) throw new RequestError("請重新登入。", 401);
  return new SignJWT({ role: who.role }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(who.sub)
    .setAudience("homebutler").setIssuedAt().setExpirationTime("60s").sign(assertionKey());
}

/** Calls HomeButler. Errors become RequestError with HomeButler's own message and status. */
export async function hb(method: Method, path: string, options: { body?: unknown; user?: SessionUser; timeoutMs?: number } = {}): Promise<unknown> {
  if (isDemoMode()) throw new Error("Demo mode blocks all HomeButler requests.");
  const { base, key } = config();
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (options.user) headers["X-Dashboard-Assertion"] = await assertion(options.user);
  const init: RequestInit = { method, headers, cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 25_000) };
  if (method !== "GET" && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new RequestError(typeof detail === "string" ? detail : "後端服務暫時無法處理，請稍後重試。", res.status);
  }
  return data;
}
