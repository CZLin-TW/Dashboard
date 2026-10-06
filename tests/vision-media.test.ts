import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";
import { MediaLeaseStore, type MediaOwner } from "../src/lib/vision-media-leases";
import { MediaError, mediaFixtureConfig, type MediaUpstream, type MediaPath } from "../src/lib/vision-media-http";
import { POST as offerRoute } from "../src/app/api/vision/v1/media/offer/route";
import { POST as heartbeatRoute } from "../src/app/api/vision/v1/media/heartbeat/route";
import { POST as stopRoute } from "../src/app/api/vision/v1/media/stop/route";
import { GET as stateRoute } from "../src/app/api/vision/v1/media/state/route";
import { GET as accessRoute } from "../src/app/api/vision/v1/access/route";

const SDP = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n";
const nativeId = "native-private-session-identifier-1234";
const freshSignal = () => new AbortController().signal;
const allow = async () => {};
function setup() {
  let now = 100000; let granted = true;
  const calls: { path: MediaPath; body: Record<string, unknown> }[] = [];
  const upstream: MediaUpstream = { async call(path, body) {
    calls.push({ path, body });
    return path === "offer" ? { status: 200, body: { session_id: nativeId, type: "answer", sdp: SDP, expires_at: (now + 8000) / 1000 } } : { status: 200, body: { active: path === "heartbeat", expires_at: (now + 8000) / 1000 } };
  } };
  const store = new MediaLeaseStore(() => granted, () => now);
  const alice: MediaOwner = { id: "alice", expiresAt: now + 100000 };
  const bob: MediaOwner = { id: "bob", expiresAt: now + 100000 };
  return { store, upstream, calls, alice, bob, setNow(value: number) { now = value; }, revoke() { granted = false; } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

test("media leases hide upstream identity, isolate users, reject second viewer and stop idempotently", async () => {
  const f = setup();
  const result = await f.store.offer(f.alice, SDP, f.upstream, freshSignal(), allow);
  assert.notEqual(result.session_id, nativeId);
  assert.match(result.session_id, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(JSON.stringify(result).includes(nativeId), false);
  await assert.rejects(f.store.heartbeat(f.bob, result.session_id, true), { code: "media_session_not_found" });
  await assert.rejects(f.store.stop(f.bob, result.session_id), { code: "media_session_not_found" });
  assert.deepEqual(await f.store.state(f.bob), { active: false, reason: "not_started", media: null });
  await assert.rejects(f.store.offer(f.bob, SDP, f.upstream, freshSignal(), allow), { code: "media_viewer_busy" });
  await f.store.stop(f.alice, result.session_id);
  await f.store.stop(f.alice, result.session_id);
  assert.equal(f.calls.filter(c => c.path === "stop").length, 1);
});

test("current grant revocation and original JWT expiry stop leases without extending them", async () => {
  const f = setup();
  const result = await f.store.offer({ ...f.alice, expiresAt: 101000 }, SDP, f.upstream, freshSignal(), allow);
  assert.equal(result.expires_at, 101);
  f.setNow(101001); await f.store.sweep();
  assert.equal(f.calls.filter(c => c.path === "stop").length, 1);
  await f.store.offer(f.alice, SDP, f.upstream, freshSignal(), allow);
  f.revoke(); await f.store.sweep();
  assert.equal((await f.store.state(f.alice)).active, false);
  await assert.rejects(f.store.offer(f.alice, SDP, f.upstream, freshSignal(), allow), { code: "vision_forbidden" });
});

test("aborted late offer learns native ID then closes; no late answer becomes active", async () => {
  const f = setup(); const pending = deferred<Awaited<ReturnType<MediaUpstream["call"]>>>();
  const upstream: MediaUpstream = { call: (path, body) => path === "offer" ? pending.promise : f.upstream.call(path, body) };
  const abort = new AbortController();
  const task = f.store.offer(f.alice, SDP, upstream, abort.signal, allow);
  const rejected = assert.rejects(task, { code: "media_result_unknown" });
  await flush(); abort.abort();
  pending.resolve({ status: 200, body: { session_id: nativeId, type: "answer", sdp: SDP, expires_at: 108 } });
  await rejected;
  assert.equal(f.calls.filter(c => c.path === "stop").length, 1);
  assert.equal((await f.store.state(f.alice)).active, false);
});

test("grant revoked during native offer triggers cleanup instead of returning SDP", async () => {
  const f = setup(); let checks = 0;
  await assert.rejects(f.store.offer(f.alice, SDP, f.upstream, freshSignal(), async () => {
    checks++; if (checks === 2) { f.revoke(); throw new MediaError("vision_forbidden", 403); }
  }), { code: "vision_forbidden" });
  assert.equal(f.calls.filter(c => c.path === "stop").length, 1);
});

test("transport unknown quarantines the slot through dispatch budget plus maximum native TTL", async () => {
  const f = setup(); let attempts = 0;
  const upstream: MediaUpstream = { async call() { attempts++; throw new MediaError("media_result_unknown"); } };
  await assert.rejects(f.store.offer(f.alice, SDP, upstream, freshSignal(), allow));
  f.setNow(166999); await f.store.sweep();
  await assert.rejects(f.store.offer(f.bob, SDP, f.upstream, freshSignal(), allow), { code: "media_viewer_busy" });
  assert.equal(attempts, 1);
  f.setNow(167001); await f.store.sweep();
  const result = await f.store.offer(f.bob, SDP, f.upstream, freshSignal(), allow);
  await f.store.stop(f.bob, result.session_id);
});

test("late heartbeat cannot resurrect a stopped lease or interfere with its replacement", async () => {
  const f = setup(); const pending = deferred<Awaited<ReturnType<MediaUpstream["call"]>>>();
  const upstream: MediaUpstream = { call: (path, body) => path === "heartbeat" ? pending.promise : f.upstream.call(path, body) };
  const result = await f.store.offer(f.alice, SDP, upstream, freshSignal(), allow);
  const heartbeat = f.store.heartbeat(f.alice, result.session_id, true);
  const rejected = assert.rejects(heartbeat, { code: "media_result_unknown" });
  await flush(); await f.store.stop(f.alice, result.session_id);
  const bob = await f.store.offer(f.bob, SDP, f.upstream, freshSignal(), allow);
  pending.resolve({ status: 200, body: { active: true } });
  await rejected;
  assert.equal((await f.store.state(f.bob)).active, true);
  await f.store.stop(f.bob, bob.session_id);
});

test("malformed or non-loopback native SDP fails closed and cleans known native session", async () => {
  for (const extra of [{ secret: "do-not-expose" }, { sdp: SDP + "a=candidate:1 1 UDP 123 192.168.1.2 5000 typ host\r\n" }]) {
    const f = setup();
    const upstream: MediaUpstream = { async call(path, body) {
      const response = await f.upstream.call(path, body);
      return path === "offer" ? { status: 200, body: { ...(response.body as object), ...extra } } : response;
    } };
    await assert.rejects(f.store.offer(f.alice, SDP, upstream, freshSignal(), allow));
    assert.equal(f.calls.filter(c => c.path === "stop").length, 1);
  }
});

test("actual media route JWT/grants, CSRF, body bounds, projection and production default deny", async () => {
  const names = ["NODE_ENV", "VERCEL_ENV", "DASHBOARD_VISION_GRANTS", "DASHBOARD_VISION_MEDIA_FIXTURE_MODE", "DASHBOARD_VISION_MEDIA_FIXTURE_PORT", "DASHBOARD_VISION_MEDIA_FIXTURE_TOKEN"];
  const env = process.env as Record<string, string | undefined>;
  const before = Object.fromEntries(names.map(n => [n, env[n]]));
  const origin = "http://127.0.0.1:3044";
  const member = await new SignJWT({ lineUserId: "alice", role: "member" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
  const kid = await new SignJWT({ lineUserId: "alice", role: "kid" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
  function request(token = member, data: unknown = {}, headers: Record<string, string> = {}) {
    return new Request(origin + "/api/vision/v1/media/offer", { method: "POST", headers: { cookie: `dashboard_session=${token}`, origin, "content-type": "application/json", ...headers }, body: JSON.stringify(data) });
  }
  async function status(response: Response, expected: number) { assert.equal(response.status, expected); assert.equal(response.headers.get("cache-control"), "no-store"); }
  try {
    env.NODE_ENV = "test"; delete env.VERCEL_ENV;
    env.DASHBOARD_VISION_GRANTS = '{"alice":["preview"]}';
    env.DASHBOARD_VISION_MEDIA_FIXTURE_MODE = "1"; env.DASHBOARD_VISION_MEDIA_FIXTURE_PORT = "1"; env.DASHBOARD_VISION_MEDIA_FIXTURE_TOKEN = "fixture-native-webrtc-public-only";
    assert.ok(mediaFixtureConfig());
    assert.equal((await (await accessRoute(new Request(origin+"/api/vision/v1/access",{headers:{cookie:`dashboard_session=${member}`}}))).json()).native_preview_available,true);
    for (const handler of [offerRoute, heartbeatRoute, stopRoute]) {
      await status(await handler(request("invalid")),401);
      await status(await handler(request(kid)),403);
      await status(await handler(request(member,{}, { origin:"https://evil.invalid" })),403);
      await status(await handler(request(member,{}, { "content-type":"text/plain" })),415);
    }
    await status(await offerRoute(request(member,{type:"offer",sdp:"x".repeat(33000)})),413);
    await status(await offerRoute(request(member,{type:"offer",sdp:SDP,token:"private-value"})),400);
    await status(await offerRoute(request(member,{type:"offer",sdp:"invalid"})),400);
    await status(await heartbeatRoute(request(member,{session_id:"x".repeat(32),visible:"true"})),400);
    const state=await stateRoute(new Request(origin+"/api/vision/v1/media/state",{headers:{cookie:`dashboard_session=${member}`}}));
    assert.deepEqual(await state.json(),{active:false,reason:"not_started",media:null});
    env.DASHBOARD_VISION_GRANTS='{"alice":["status"]}';
    await status(await offerRoute(request()),403);
    env.DASHBOARD_VISION_GRANTS='{"alice":["preview"]}'; env.NODE_ENV="production";
    assert.equal(mediaFixtureConfig(),undefined);
    await status(await offerRoute(request(member,{type:"offer",sdp:SDP})),503);
    env.NODE_ENV="test";env.VERCEL_ENV="production";
    assert.equal(mediaFixtureConfig(),undefined);
    env.VERCEL_ENV="preview";env.DASHBOARD_VISION_MEDIA_FIXTURE_TOKEN="not-a-fixture-secret";
    assert.equal(mediaFixtureConfig(),undefined);
  } finally { for (const name of names) if (before[name]===undefined) delete env[name]; else env[name]=before[name]; }
});
