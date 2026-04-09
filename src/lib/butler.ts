const HOME_BUTLER_URL = process.env.HOME_BUTLER_URL ?? "https://home-butler.onrender.com";
const HOME_BUTLER_API_KEY = process.env.HOME_BUTLER_API_KEY ?? "";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  // X-API-Key required by home-butler /api/*, /notify*, /switchbot/* endpoints.
  // Read on every call (not cached) so a redeploy with a rotated key takes effect immediately.
  return { ...(extra ?? {}), "X-API-Key": HOME_BUTLER_API_KEY };
}

export async function butlerGet(path: string): Promise<unknown> {
  const res = await fetch(`${HOME_BUTLER_URL}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Butler API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function butlerPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${HOME_BUTLER_URL}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Butler API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function butlerPatch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${HOME_BUTLER_URL}${path}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Butler API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function butlerDelete(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${HOME_BUTLER_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Butler API error ${res.status}: ${text}`);
  }
  return res.json();
}
