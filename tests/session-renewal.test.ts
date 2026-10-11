import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT, decodeJwt } from "jose";
import { GET as meGET } from "../src/app/api/auth/me/route";
import { createSession } from "../src/lib/auth";
import { JWT_SECRET, verifyToken } from "../src/lib/jwt";

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

async function token(claims: Record<string, unknown>, issuedAgo: number | null, lifetime = 7 * DAY) {
  const jwt = new SignJWT({ lineUserId: "alice-id", name: "Alice", role: "member", ...claims }).setProtectedHeader({ alg: "HS256" });
  if (issuedAgo !== null) jwt.setIssuedAt(now() - issuedAgo);
  return jwt.setExpirationTime(now() + lifetime).sign(JWT_SECRET);
}

/** Calls the route with a fake backend; returns what the backend saw and what the browser got. */
async function visit(session: string | null, backend: () => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const seen: { url: string; user: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), user: new Headers(init?.headers).get("X-Dashboard-User") });
    return backend();
  };
  try {
    const response = await meGET(new Request("http://dashboard.test/api/auth/me", { headers: session ? { cookie: `dashboard_session=${session}` } : {} }));
    return { seen, response, cookie: response.headers.get("set-cookie") ?? "", body: await response.json() };
  } finally { globalThis.fetch = original; }
}
const issued = (cookie: string) => decodeJwt(cookie.split(";")[0].split("=")[1]);

test("a session used within a day is returned as is, without asking the backend", async () => {
  const result = await visit(await token({}, 3600), () => { throw new Error("must not be called"); });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.name, "Alice");
  assert.equal(result.seen.length, 0);
  assert.equal(result.cookie, "");
});

test("an older session of an active member is reissued for 90 days with the roster name", async () => {
  for (const issuedAgo of [2 * DAY, null]) {   // null: a session signed before issue times existed
    const result = await visit(await token({}, issuedAgo), () => Response.json({ active: true, name: "Alice Chen" }));
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.seen, [{ url: result.seen[0].url, user: "alice-id" }]);
    assert.ok(result.seen[0].url.endsWith("/api/auth/member"));
    assert.equal(result.body.name, "Alice Chen");
    const claims = issued(result.cookie);
    assert.equal(claims.lineUserId, "alice-id");
    assert.equal(claims.name, "Alice Chen");
    assert.ok(Math.abs(claims.iat! - now()) < 5 && Math.abs(claims.exp! - now() - 90 * DAY) < 5);
    assert.match(result.cookie, /Max-Age=7776000/i);
    assert.match(result.cookie, /HttpOnly/i);
  }
});

test("a member the roster no longer lists as active is signed out", async () => {
  const result = await visit(await token({}, 2 * DAY), () => Response.json({ active: false }));
  assert.equal(result.response.status, 401);
  assert.match(result.cookie, /dashboard_session=;/);
});

test("an unreachable or confused backend neither extends nor revokes", async () => {
  const session = await token({}, 2 * DAY);
  for (const backend of [
    () => { throw new Error("network"); },
    () => new Response("bad gateway", { status: 502 }),
    () => Response.json({ detail: "Not Found" }, { status: 404 }),   // backend older than this feature
    () => Response.json({}),
    () => Response.json({ active: "yes" }),
  ]) {
    const result = await visit(session, backend);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.name, "Alice");
    assert.equal(result.cookie, "");
  }
});

test("kid remotes, expired and missing sessions are never renewed", async () => {
  const kid = await visit(await token({ role: "kid", name: "小朋友" }, 30 * DAY, 365 * DAY), () => { throw new Error("must not be called"); });
  assert.equal(kid.response.status, 200);
  assert.equal(kid.body.role, "kid");
  assert.equal(kid.cookie, "");
  for (const session of [await token({}, 8 * DAY, -60), null, "garbage"]) {
    const result = await visit(session, () => Response.json({ active: true, name: "Alice" }));
    assert.equal(result.response.status, 401);
    assert.equal(result.seen.length, 0);
    assert.equal(result.cookie, "");
  }
});

test("new sessions carry an issue time; kid sessions keep their one-year life", async () => {
  const member = decodeJwt(await createSession({ lineUserId: "a", name: "A", role: "member" }));
  assert.ok(member.iat && member.exp! - member.iat === 90 * DAY);
  const kid = decodeJwt(await createSession({ lineUserId: "k", name: "小朋友", role: "kid" }));
  assert.ok(kid.exp! - kid.iat! === 365 * DAY);
  assert.equal((await verifyToken(await token({}, null)))?.lineUserId, "alice-id");
});
