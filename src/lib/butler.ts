const HOME_BUTLER_URL = process.env.HOME_BUTLER_URL ?? "https://home-butler.onrender.com";

export async function butlerGet(path: string): Promise<unknown> {
  const res = await fetch(`${HOME_BUTLER_URL}${path}`, {
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Butler API error ${res.status}: ${text}`);
  }
  return res.json();
}
