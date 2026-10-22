import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT, decodeJwt } from "jose";
import { GET as meGET } from "../src/app/api/auth/me/route";
import { createSession } from "../src/lib/auth";
import { JWT_SECRET, verifyToken } from "../src/lib/jwt";

const DAY = 86_400;
process.env.HOME_BUTLER_DASHBOARD_KEY = "test-dashboard-key";   // the fake backend below answers; this only lets requests leave
const now = () => Math.floor(Date.now() / 1000);

async function token(claims: Record<string, unknown>, issuedAgo: number | null, lifetime = 7 * DAY) {
  const jwt = new SignJWT({ lineUserId: "alice-id", name: "Alice", role: "member", ...claims }).setProtectedHeader({ alg: "HS256" });
  if (issuedAgo !== null) jwt.setIssuedAt(now() - issuedAgo);
  return jwt.setExpirationTime(now() + lifetime).sign(JWT_SECRET);
}

/** Calls the route with a fake backend; returns what the backend saw and what the browser got. */
async function visit(session: string | null, backend: () => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const seen: { url: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
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

test("an older session of an active member is reissued for 30 days with the roster name", async () => {
  for (const issuedAgo of [2 * DAY, null]) {   // null: a session signed before issue times existed
    const result = await visit(await token({}, issuedAgo), () => Response.json({ active: true, name: "Alice Chen" }));
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.seen, [{ url: result.seen[0].url, body: { line_user_id: "alice-id" } }]);
    assert.ok(result.seen[0].url.endsWith("/v2/sign-in/member"));
    assert.equal(result.body.name, "Alice Chen");
    const claims = issued(result.cookie);
    assert.equal(claims.lineUserId, "alice-id");
    assert.equal(claims.name, "Alice Chen");
    assert.ok(Math.abs(claims.iat! - now()) < 5 && Math.abs(claims.exp! - now() - 30 * DAY) < 5);
    assert.match(result.cookie, /Max-Age=2592000/i);
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

test("a remote slides for 14 days while its row is enabled, and is signed out once it is not", async () => {
  const remote = () => token({ lineUserId: "remote", role: "kid", name: "客廳 平板", remoteId: 7 }, 3 * DAY, 14 * DAY);
  const kept = await visit(await remote(), () => Response.json({ active: true, name: "ignored" }));
  assert.equal(kept.response.status, 200);
  assert.ok(kept.seen[0].url.endsWith("/v2/sign-in/remote/7"));
  const claims = issued(kept.cookie);
  assert.deepEqual([claims.role, claims.name, claims.lineUserId, claims.remoteId], ["kid", "客廳 平板", "remote", 7]);
  assert.ok(Math.abs(claims.exp! - now() - 14 * DAY) < 5);
  assert.match(kept.cookie, /Max-Age=1209600/i);
  const off = await visit(await remote(), () => Response.json({ active: false }));
  assert.equal(off.response.status, 401);
  assert.match(off.cookie, /dashboard_session=;/);
  const unsure = await visit(await remote(), () => new Response("bad gateway", { status: 502 }));
  assert.equal(unsure.response.status, 200);
  assert.equal(unsure.cookie, "");
  const fresh = await visit(await token({ lineUserId: "remote", role: "kid", name: "客廳 平板", remoteId: 7 }, 600, 14 * DAY), () => { throw new Error("must not be called"); });
  assert.equal(fresh.body.role, "kid");
  assert.equal(fresh.cookie, "");
  // A remote session signed before v2 has no remote id: it ends, and the tablet signs in with its password again.
  // Renewed less than a day ago makes no difference (2026-10-22: a phone kept such a session and was never asked to sign in).
  for (const ago of [3 * DAY, 600]) {
    const old = await token({ lineUserId: "remote", role: "kid", name: "客廳 平板" }, ago, 14 * DAY);
    const result = await visit(old, () => { throw new Error("must not be called"); });
    assert.equal(result.response.status, 401);
    assert.match(result.cookie, /dashboard_session=;/);
    assert.equal(await verifyToken(old), null);          // so the gate sends pages to /login and APIs get 401
  }
});

test("a restricted session from the removed LINE pairing ends without asking the backend", async () => {
  const legacy = await visit(await token({ lineUserId: "parent-id", role: "kid", name: "小朋友" }, 30 * DAY, 365 * DAY), () => { throw new Error("must not be called"); });
  assert.equal(legacy.response.status, 401);
  assert.equal(legacy.seen.length, 0);
  assert.match(legacy.cookie, /dashboard_session=;/);
});

test("expired and missing sessions are never renewed", async () => {
  for (const session of [await token({}, 8 * DAY, -60), null, "garbage"]) {
    const result = await visit(session, () => Response.json({ active: true, name: "Alice" }));
    assert.equal(result.response.status, 401);
    assert.equal(result.seen.length, 0);
    assert.equal(result.cookie, "");
  }
});

test("new sessions carry an issue time: members 30 days, remotes 14", async () => {
  const member = decodeJwt(await createSession({ lineUserId: "a", name: "A", role: "member" }));
  assert.ok(member.iat && member.exp! - member.iat === 30 * DAY);
  const kid = decodeJwt(await createSession({ lineUserId: "remote", name: "平板", role: "kid" }));
  assert.ok(kid.exp! - kid.iat! === 14 * DAY);
  assert.equal((await verifyToken(await token({}, null)))?.lineUserId, "alice-id");
});

test("pairing signs in members only and refuses any other role from the backend", async () => {
  const { POST: pollPOST } = await import("../src/app/api/auth/device-poll/route");
  const { POST: codePOST } = await import("../src/app/api/auth/device-code/route");
  const original = globalThis.fetch;
  let answer: unknown = {};
  const bodies: unknown[] = [];
  globalThis.fetch = async (_input, init) => { bodies.push(init?.body); return Response.json(answer); };
  try {
    answer = { user_code: "123456", device_token: "t", expires_in: 300 };
    assert.equal((await codePOST()).status, 200);
    assert.equal(bodies[0], undefined);
    answer = { status: "approved", user: { lineUserId: "alice-id", name: "Alice", role: "member" } };
    const poll = () => pollPOST(new Request("http://dashboard.test/api/auth/device-poll", { method: "POST", body: JSON.stringify({ token: "t" }) }));
    const ok = await poll();
    assert.deepEqual(JSON.parse(String(bodies[1])), { device_token: "t" });   // the secret travels in the body, never a URL
    assert.equal(ok.status, 200);
    assert.equal(issued(ok.headers.get("set-cookie")!).role, "member");
    answer = { status: "approved", user: { lineUserId: "parent-id", name: "Parent", role: "kid" } };
    const refused = await poll();
    assert.equal(refused.status, 500);
    assert.equal(refused.headers.get("set-cookie"), null);
  } finally { globalThis.fetch = original; }
});
