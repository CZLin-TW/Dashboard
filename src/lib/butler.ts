import { isDemoMode } from "./demo/config";
import { RequestError } from "./request-user";

const HOME_BUTLER_URL = process.env.HOME_BUTLER_URL ?? "https://home-butler.onrender.com";
const HOME_BUTLER_API_KEY = process.env.HOME_BUTLER_API_KEY ?? "";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function butler(method: Method, path: string, body?: unknown, userId?: string): Promise<unknown> {
  if (isDemoMode()) throw new Error("Demo mode blocks all home-butler requests.");
  // X-API-Key required by home-butler /api/*, /notify*, /switchbot/* endpoints.
  // The environment value is captured at module load; redeploy after rotating it.
  const headers: Record<string, string> = { "X-API-Key": HOME_BUTLER_API_KEY };
  if (/^\/api\/(dashboard|todos|recurring-todos)(?:[/?]|$)/.test(path)) {
    if (!userId) throw new RequestError("請先登入。", 401);
    // Only server-verified JWT identity is forwarded; client headers/body cannot override it.
    headers["X-Dashboard-User"] = userId;
  }
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(25_000),
  };
  if (method === "GET") {
    init.cache = "no-store";
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${HOME_BUTLER_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    let message = "後端服務暫時無法處理，請稍後重試。";
    try { const data = JSON.parse(text); if (typeof data.detail === "string") message = data.detail; } catch { /* Non-JSON upstream error. */ }
    throw new RequestError(message, res.status);
  }
  return res.json();
}

export const butlerGet = (path: string, userId?: string) => butler("GET", path, undefined, userId);
export const butlerPost = (path: string, body: unknown, userId?: string) => butler("POST", path, body, userId);
export const butlerPatch = (path: string, body: unknown, userId?: string) => butler("PATCH", path, body, userId);
export const butlerDelete = (path: string, body: unknown, userId?: string) => butler("DELETE", path, body, userId);
