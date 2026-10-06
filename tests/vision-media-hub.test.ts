import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createMediaHub, mediaHubConfig } from "../src/lib/vision-media-hub";
const token = "fixture-media-hub-service-public-only";
const actor = () => ({id: "synthetic-alice", expiresAt: Date.now()+90000});
const SDP = "v=0\r\ns=-\r\nt=0 0\r\n";

test("stateless BFF adapters delegate ownership and actor expiry to one HTTP authority", async () => {
  Object.assign(process.env, {NODE_ENV: "test"});
  const calls: {path?: string; payload: Record<string, unknown>}[] = [];
  let active = false;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(payload.actor.id, "synthetic-alice"); assert(payload.actor.expires_at > Date.now()/1000);
    calls.push({path: req.url, payload});
    if (req.url?.endsWith("offer")) active = true;
    if (req.url?.endsWith("stop")) active = false;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.url?.endsWith("offer") ? {session_id: "a".repeat(32), type: "answer", sdp: SDP, expires_at: Date.now()/1000+8} : {active, reason: active ? "lease_active" : "unknown", media: null}));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  try {
    const config = {port: (server.address() as AddressInfo).port, token};
    const first = createMediaHub(config), second = createMediaHub(config);
    const lease = await first.call("offer", actor(), {type: "offer", sdp: SDP});
    assert.equal((await second.call("state", actor())).active, true);
    await second.call("stop", actor(), {session_id: lease.session_id});
    assert.deepEqual(await first.call("state", actor()), {active: false, reason: "unknown", media: null});
    assert.equal(calls.length, 4);
    assert(calls.every(c => c.path?.startsWith("/api/vision-media/v1/")));
    assert(calls.every(c => !("device_id" in c.payload)));
  } finally { await new Promise<void>(r => server.close(() => r())); }
});

test("HB fixture cannot enable production or accept URLs or arbitrary credentials", async () => {
  Object.assign(process.env, {NODE_ENV: "test", DASHBOARD_VISION_MEDIA_HUB_FIXTURE_MODE: "1", DASHBOARD_VISION_MEDIA_HUB_FIXTURE_PORT: "12345", DASHBOARD_VISION_MEDIA_HUB_FIXTURE_TOKEN: token});
  assert.equal(mediaHubConfig()?.port, 12345);
  const client = createMediaHub(mediaHubConfig()!);
  Object.assign(process.env, {NODE_ENV: "production"});
  assert.equal(mediaHubConfig(), undefined);
  await assert.rejects(client.call("state", actor()), {code: "media_disabled"});
  Object.assign(process.env, {NODE_ENV: "test", DASHBOARD_VISION_MEDIA_HUB_FIXTURE_PORT: "http://127.0.0.1:12345"});
  assert.equal(mediaHubConfig(), undefined);
  assert.throws(() => createMediaHub({port: 12345, token: "anything"}), {code: "media_disabled"});
});

test("HB unknown or redirect responses are not retried and malformed answers are rejected", async () => {
  Object.assign(process.env, {NODE_ENV: "test"}); let count = 0; let status = 302;
  const server = createServer((req, res) => { req.resume(); count++; res.writeHead(status, {"content-type": "application/json", location: "http://127.0.0.1:1"}); res.end(JSON.stringify({session_id: "a".repeat(32), type: "answer", sdp: SDP, expires_at: Infinity})); });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  try {
    const client = createMediaHub({port: (server.address() as AddressInfo).port, token});
    await assert.rejects(client.call("offer", actor(), {type: "offer", sdp: SDP}), {code: "media_result_unknown"});
    assert.equal(count, 1); status = 200;
    await assert.rejects(client.call("offer", actor(), {type: "offer", sdp: SDP}), {code: "media_result_unknown"});
    assert.equal(count, 2);
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
