import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";
import { createVisionHTTPTransport, configuredVisionHTTPTransport, VisionHTTPError } from "../src/lib/vision-http";
import { GET as statusRoute } from "../src/app/api/vision/v1/status/route";
import { GET as configRoute, PUT as saveRoute } from "../src/app/api/vision/v1/config/route";

const fixtureToken = "fixture-dashboard-public-test-only";
const caps = { status: true, preview: false, edit: true };
const config = { revision: 0, model: "yolo11n", precision: "fp16" } as const;
const payload = { adapter: "synthetic", available: true, config_revision: 71, detector_revision: 0, detector: { model: "yolo11n", precision: "fp16" }, zone_count: 2 };
type Command = { protocol: string; type: string; request_id: string; device_id: string; action: string; deadline: number; payload: Record<string, unknown> };
function envelope(command: Command, body: unknown = payload) { return { protocol: "vision.v1", type: "result", request_id: command.request_id, device_id: command.device_id, session_nonce: "fake-session-nonce-1234567890", status: "ok", payload: body }; }
async function server(run: (port: number) => Promise<void>, handler: (body: Command, response: ServerResponse, request: IncomingMessage) => void) {
  const http = createServer(async (request, response) => {
    let text = ""; for await (const part of request) text += part;
    handler(JSON.parse(text), response, request);
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  try { await run((http.address() as AddressInfo).port); }
  finally { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); }
}
function reply(response: ServerResponse, value: unknown) { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); }

test("actual loopback HTTP maps detector config revisions and emits bounded authenticated commands", async () => {
  const commands: Command[] = [];
  await server(async port => {
    const transport = createVisionHTTPTransport({ port, token: fixtureToken, deviceId: "synthetic-mini" });
    assert.deepEqual(await transport.config(), config);
    const status = await transport.status(caps); assert.equal(status.source, "synthetic"); assert.equal(status.revision, 0); assert.deepEqual(status.capabilities, caps);
    assert.deepEqual(await transport.save({ revision: 0, model: "yolo11s", precision: "fp32" }), { revision: 1, model: "yolo11s", precision: "fp32" });
  }, (command, response, request) => {
    commands.push(command); assert.equal(request.url, "/api/vision/v1/command"); assert.equal(request.method, "POST"); assert.equal(request.headers.authorization, `Bearer ${fixtureToken}`);
    assert.equal(command.protocol, "vision.v1"); assert.equal(command.type, "command"); assert.match(command.request_id, /^[a-f0-9-]{36}$/);
    assert.ok(command.deadline > Date.now() / 1000 && command.deadline <= Date.now() / 1000 + 30);
    if (command.action === "status.get") { assert.deepEqual(command.payload, {}); reply(response, envelope(command)); }
    else { assert.equal(command.action, "detector.configure"); assert.deepEqual(command.payload, { expected_revision: 0, model: "yolo11s", precision: "fp32" }); reply(response, envelope(command, { revision: 1, model: "yolo11s", precision: "fp32" })); }
  });
  assert.equal(new Set(commands.map(c => c.request_id)).size, 3);
});

test("actual HTTP rejects mismatched identity, unexpected action payload and oversize response", async () => {
  let mode = "request_id";
  await server(async port => {
    const transport = createVisionHTTPTransport({ port, token: fixtureToken, deviceId: "synthetic-mini" });
    for (mode of ["request_id", "device_id", "session_nonce", "action", "extra", "oversize", "malformed"]) {
      await assert.rejects(transport.config(), error => error instanceof VisionHTTPError && error.status === 502);
    }
  }, (command, response) => {
    if (mode === "malformed") { response.writeHead(200, { "content-type": "application/json" }); response.end("{"); return; }
    if (mode === "oversize") { reply(response, { padding: "x".repeat(33000) }); return; }
    const result: Record<string, unknown> = envelope(command);
    if (mode === "action") result.payload = config;
    else if (mode === "extra") result.secret = "must-not-be-forwarded";
    else result[mode] = "wrong";
    reply(response, result);
  });
});

test("unknown and conflict stay distinct; redirects, timeouts and cancellation never retry", async () => {
  let mode = "unknown", calls = 0;
  await server(async port => {
    const transport = createVisionHTTPTransport({ port, token: fixtureToken, deviceId: "synthetic-mini", timeoutMs: 50 });
    await assert.rejects(transport.save(config), error => error instanceof VisionHTTPError && error.code === "vision_execution_unknown");
    mode = "conflict"; await assert.rejects(transport.save(config), error => error instanceof VisionHTTPError && error.status === 409);
    mode = "redirect"; await assert.rejects(transport.config(), error => error instanceof VisionHTTPError && error.code === "vision_execution_unknown");
    mode = "stall"; await assert.rejects(transport.config(), error => error instanceof VisionHTTPError && error.code === "vision_execution_unknown");
    const abort = new AbortController(); const pending = transport.save(config, abort.signal); setTimeout(() => abort.abort(), 10);
    await assert.rejects(pending, VisionHTTPError);
    const before = calls; const cancelled = new AbortController(); cancelled.abort(); await assert.rejects(transport.config(cancelled.signal), VisionHTTPError); assert.equal(calls, before);
  }, (command, response) => {
    calls++;
    if (mode === "redirect") { response.writeHead(302, { location: "http://127.0.0.1:1/must-not-follow" }); response.end(); return; }
    if (mode === "stall") return;
    const result = envelope(command) as Record<string, unknown>; delete result.payload;
    result.status = mode === "unknown" ? "unknown" : "error"; result.code = mode === "unknown" ? "execution_unknown" : "revision_conflict"; reply(response, result);
  });
  assert.equal(calls, 5);
});

test("real route gates precede HTTP and production remains disabled", async () => {
  const names = ["DASHBOARD_VISION_FIXTURE_MODE", "DASHBOARD_VISION_FIXTURE_PORT", "DASHBOARD_VISION_FIXTURE_TOKEN", "DASHBOARD_VISION_FIXTURE_DEVICE_ID", "DASHBOARD_VISION_GRANTS", "NODE_ENV"] as const;
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let calls = 0;
  try {
    await server(async port => {
      process.env.DASHBOARD_VISION_FIXTURE_MODE = "1"; process.env.DASHBOARD_VISION_FIXTURE_PORT = String(port); process.env.DASHBOARD_VISION_FIXTURE_TOKEN = fixtureToken; process.env.DASHBOARD_VISION_FIXTURE_DEVICE_ID = "synthetic-mini";
      process.env.DASHBOARD_VISION_GRANTS = JSON.stringify({ "fixture-user": ["status", "edit"] });
      const jwt = await new SignJWT({ lineUserId: "fixture-user", role: "member" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
      const origin = "http://127.0.0.1:3014", headers = { cookie: `dashboard_session=${jwt}` };
      assert.equal((await statusRoute(new Request(`${origin}/api/vision/v1/status`))).status, 401); assert.equal(calls, 0);
      assert.equal((await saveRoute(new Request(`${origin}/api/vision/v1/config`, { method: "PUT", headers: { ...headers, origin: "http://evil.invalid", "content-type": "application/json" }, body: JSON.stringify(config) }))).status, 403); assert.equal(calls, 0);
      assert.equal((await statusRoute(new Request(`${origin}/api/vision/v1/status`, { headers }))).status, 200);
      assert.deepEqual(await (await configRoute(new Request(`${origin}/api/vision/v1/config`, { headers }))).json(), config);
      const saved = await saveRoute(new Request(`${origin}/api/vision/v1/config`, { method: "PUT", headers: { ...headers, origin, "content-type": "application/json" }, body: JSON.stringify(config) }));
      assert.equal(saved.status, 200); assert.equal(saved.headers.get("cache-control"), "no-store"); assert.equal(calls, 3);
      (process.env as Record<string, string | undefined>).NODE_ENV = "production"; assert.equal(configuredVisionHTTPTransport(), undefined); assert.equal(calls, 3);
    }, (command, response) => { calls++; reply(response, envelope(command, command.action === "status.get" ? payload : config)); });
  } finally { for (const name of names) { if (before[name] === undefined) delete process.env[name]; else (process.env as Record<string, string | undefined>)[name] = before[name]; } }
});
