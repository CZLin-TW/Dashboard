const HOME_BUTLER_URL = process.env.HOME_BUTLER_URL ?? "https://home-butler.onrender.com";
const HOME_BUTLER_API_KEY = process.env.HOME_BUTLER_API_KEY ?? "";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function butler(method: Method, path: string, body?: unknown): Promise<unknown> {
  // X-API-Key required by home-butler /api/*, /notify*, /switchbot/* endpoints.
  // Read on every call (not cached) so a redeploy with a rotated key takes effect immediately.
  const headers: Record<string, string> = { "X-API-Key": HOME_BUTLER_API_KEY };
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
    throw new Error(`Butler API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const butlerGet = (path: string) => butler("GET", path);
export const butlerPost = (path: string, body: unknown) => butler("POST", path, body);
export const butlerPatch = (path: string, body: unknown) => butler("PATCH", path, body);
export const butlerDelete = (path: string, body: unknown) => butler("DELETE", path, body);
