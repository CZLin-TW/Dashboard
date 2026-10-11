import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { createDemoState, haAutomations } from "../src/lib/demo/fixtures";
import { createSimulator } from "../src/lib/demo/simulator";
import { automationTimeLabel, automationView, type HaAutomationLog } from "../src/lib/home-assistant";
import { JWT_SECRET } from "../src/lib/jwt";
import { proxy } from "../src/proxy";
import { GET as automationsGET } from "../src/app/api/home-assistant/automations/route";

test("times read as today, yesterday or a date in the viewer's own zone", () => {
  const now = new Date(2026, 9, 11, 9, 30);
  const at = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime() / 1000;
  assert.equal(automationTimeLabel(at(2026, 9, 11, 7, 5), now), "07:05");
  assert.equal(automationTimeLabel(at(2026, 9, 10, 23, 40), now), "昨天 23:40");
  assert.equal(automationTimeLabel(at(2026, 9, 9, 8, 0), now), "10/09 08:00");
  assert.equal(automationTimeLabel(at(2026, 8, 30, 0, 0), new Date(2026, 9, 1, 0, 5)), "昨天 00:00");
});

test("the card lists newest runs first and says why a list may be empty", () => {
  const log: HaAutomationLog = { configured: true, online: true, shared: true, received_at: 1, rules: [
    { entity_id: "automation.b", name: "乙", enabled: true, last_triggered: 100 },
    { entity_id: "automation.c", name: "丙", enabled: false, last_triggered: null },
    { entity_id: "automation.a", name: "甲", enabled: true, last_triggered: 300 },
  ], runs: [{ entity_id: "automation.b", name: "乙", at: 100 }, { entity_id: "automation.a", name: "甲", at: 300 }] };
  const view = automationView(log);
  assert.equal(view.notice, null);
  assert.deepEqual(view.runs.map(run => run.name), ["甲", "乙"]);
  assert.deepEqual(view.rules.map(rule => rule.name), ["甲", "乙", "丙"]);
  assert.equal(log.runs[0].name, "乙");   // the fetched data is not reordered in place
  assert.equal(automationView({ ...log, online: false }).notice, "offline");
  assert.equal(automationView({ ...log, shared: false, online: false }).notice, "not_shared");
  assert.equal(automationView({ ...log, configured: false }).notice, "unconfigured");
  assert.deepEqual(automationView(null), { notice: null, runs: [], rules: [] });
});

test("demo covers shared, not shared and offline; the route has no write methods", async () => {
  const sim = createSimulator(createDemoState());
  const response = await sim.handle(new Request("http://demo/api/home-assistant/automations"));
  assert.equal(response.status, 200);
  const log = await response.json() as HaAutomationLog;
  assert.equal(automationView(log).notice, null);
  assert.ok(log.runs.length >= 3 && log.rules.some(rule => rule.enabled === false));
  assert.equal((await sim.handle(new Request("http://demo/api/home-assistant/automations", { method: "POST", body: "{}" }))).status, 501);
  assert.equal(automationView(haAutomations("empty")).notice, "not_shared");
  const offline = haAutomations("offline");
  assert.equal(automationView(offline).notice, "offline");
  assert.ok(offline.runs.length > 0 && offline.rules.every(rule => rule.enabled === null));
  const route = await import("../src/app/api/home-assistant/automations/route");
  assert.deepEqual(Object.keys(route), ["GET"]);
});

test("members and remotes may read it; the backend answer is passed through unchanged", async () => {
  const session = (role: string) => new SignJWT({ lineUserId: role === "kid" ? "remote" : "alice-id", name: "x", role })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(JWT_SECRET);
  for (const role of ["member", "kid"]) {
    const request = new NextRequest("http://dashboard.test/api/home-assistant/automations", { headers: { cookie: `dashboard_session=${await session(role)}` } });
    assert.equal((await proxy(request)).status, 200, role);
  }
  assert.equal((await proxy(new NextRequest("http://dashboard.test/api/home-assistant/automations"))).status, 401);
  const kid = new NextRequest("http://dashboard.test/api/home-assistant/observations", { headers: { cookie: `dashboard_session=${await session("kid")}` } });
  assert.equal((await proxy(kid)).status, 403);
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async (input) => { seen.push(String(input)); return Response.json(haAutomations("normal", 1_760_000_000_000)); };
  try {
    const response = await automationsGET();
    assert.deepEqual(await response.json(), haAutomations("normal", 1_760_000_000_000));
    assert.ok(seen[0].endsWith("/api/home-assistant/automations"));
    globalThis.fetch = async () => new Response("bad gateway", { status: 502 });
    assert.equal((await automationsGET()).status, 500);
  } finally { globalThis.fetch = original; }
});
