/** Real HTTP BFF -> HB -> outbound device integration; explicitly invoked only. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";
import { GET as status } from "../src/app/api/vision/v1/status/route";
import { GET as config, PUT as save } from "../src/app/api/vision/v1/config/route";

async function main() {
  assert.equal(process.env.DASHBOARD_VISION_FIXTURE_MODE, "1");
  assert.equal(process.env.NODE_ENV, "test");
  const jwt = await new SignJWT({ lineUserId: "synthetic-member", role: "member" })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1m").sign(JWT_SECRET);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const request = new Request(`http://127.0.0.1:${(server.address() as { port: number }).port}${incoming.url}`, {
        method: incoming.method, headers: incoming.headers as Record<string, string>,
        ...(incoming.method === "PUT" ? { body: Buffer.concat(chunks) } : {}),
      });
      const handler = incoming.url?.endsWith("status") ? status : incoming.method === "PUT" ? save : config;
      const response = await handler(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { cookie: `dashboard_session=${jwt}`, origin, "content-type": "application/json" };
  async function request(path: string, method = "GET", body?: unknown, authorized = true) {
    return fetch(`${origin}/api/vision/v1/${path}`, { method, headers: authorized ? headers : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  try {
    assert.equal((await request("status", "GET", undefined, false)).status, 401);
    const health = await request("status"); assert.equal(health.status, 200);
    assert.equal((await health.json()).source, "synthetic");
    const initialResponse = await request("config"); assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json();
    const change = { ...initial, model: "yolo11s", precision: "fp16" };
    const clients = await Promise.all([request("config", "PUT", change), request("config", "PUT", change)]);
    assert.deepEqual(clients.map(r => r.status).sort(), [200, 409]);
    const after = await (await request("config")).json();
    assert.equal(after.revision, initial.revision + 1); assert.equal(after.model, "yolo11s");
    assert.equal((await request("config", "PUT", change)).status, 409);
    console.log(JSON.stringify({ source: "synthetic-loopback", transport: "HTTP BFF -> HTTP HB -> outbound WebSocket device", checks: 6, revision: after.revision, multiClient: [200, 409] }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(() => { console.error("Synthetic full-chain verification failed"); process.exitCode = 1; });
