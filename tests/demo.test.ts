import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";
import { isDemoMode } from "../src/lib/demo/config";
import { createDemoState } from "../src/lib/demo/fixtures";
import { createSimulator, demoFetch } from "../src/lib/demo/simulator";
import { proxy } from "../src/proxy";
import { hb } from "../src/lib/hb";
import { findRule } from "../src/lib/hb-rules";
import { haIsFresh, observationText } from "../src/lib/home-assistant";
import { byRoom, devicesOf, presenceOf, roomGroups, sensorHistory, acSegments } from "../src/lib/devices";
import type { DevicesPage, History, TodoPage } from "../src/lib/api";

const origin = "http://dashboard.test";
const request = (path: string, method = "GET", body?: unknown) =>
  new Request(`http://demo${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const page = async (sim = createSimulator()) => (await (await sim.handle(request("/api/hb/devices"))).json()) as DevicesPage;

test("demo requires server opt-in, rejects production and real credentials", () => {
  assert.equal(isDemoMode({}), false);
  assert.equal(isDemoMode({ DASHBOARD_DEMO_MODE: "true" }), false);
  assert.equal(isDemoMode({ DASHBOARD_DEMO_MODE: "1", VERCEL_ENV: "preview" }), true);
  assert.throws(() => isDemoMode({ DASHBOARD_DEMO_MODE: "1", VERCEL_ENV: "production" }));
  for (const name of ["HOME_BUTLER_API_KEY", "HOME_BUTLER_DASHBOARD_KEY", "DASHBOARD_ASSERTION_KEY", "SESSION_JWT_SECRET", "LINE_LOGIN_CHANNEL_SECRET"]) {
    assert.throws(() => isDemoMode({ DASHBOARD_DEMO_MODE: "1", [name]: "fixture-not-a-secret" }));
  }
});

test("the devices page is one read with everything the cards need", async () => {
  const data = await page();
  const devices = devicesOf(data);
  assert.deepEqual(data.rooms, ["客廳", "書房", "臥室"]);
  assert.deepEqual(devices.map(d => d.kind), ["ac", "dehumidifier", "ir", "sensor", "ac", "dehumidifier", "sensor"]);
  assert.ok(data.schedules.some(s => s.source === "auto_off") && data.schedules.some(s => s.status === "unknown"));
  assert.ok(data.auto_off.length > 0 && data.options.ac.modes.some(m => m.value === "cool"));
  const history = (await (await createSimulator().handle(request("/api/hb/history"))).json()) as History;
  assert.ok(sensorHistory(history, "客廳感測器").length > 200);
  assert.ok(acSegments(history, data, "客廳").length > 0);
  const presence = presenceOf(data)!;
  assert.equal(haIsFresh(presence, 1000, 1001, false), true);
  assert.equal(observationText(presence.observations[0], true), "有人");
  assert.equal(observationText(presence.observations[1], true), "無人");
  const offline = await page(createSimulator(createDemoState("offline")));
  assert.ok(offline.acs.every(a => !a.available && a.power === null));
  assert.ok(presenceOf(offline)!.observations.every(o => o.value === null));
});

test("the room order is saved for everyone and groups follow it", async () => {
  const sim = createSimulator();
  const put = (rooms: unknown) => sim.handle(request("/api/hb/rooms/order", "PUT", { rooms }));
  assert.equal((await put(["臥室", "客廳"])).status, 200);
  const data = await page(sim);
  assert.deepEqual(data.rooms, ["臥室", "客廳", "書房"]);
  assert.deepEqual(roomGroups(devicesOf(data)).map(([room]) => room), ["臥室", "客廳", "書房"]);
  assert.deepEqual(byRoom(data, data.sensors).map(s => s.name), ["臥室感測器", "客廳感測器"]);
  assert.equal((await put(["客廳", "客廳"])).status, 422);
  assert.equal((await put([" "])).status, 422);
  const noRoom = { ...data, irs: [{ ...data.irs[0], location: "" }] };
  assert.equal(roomGroups(devicesOf(noRoom)).at(-1)![0], "其他");
});

test("AC targets are whole degrees; offline refuses commands", async () => {
  const sim = createSimulator();
  assert.equal((await sim.handle(request("/api/hb/devices/ac/客廳冷氣", "POST", { power: "on", temperature: 25.5, mode: "heat" }))).status, 200);
  const ac = sim.snapshot().acs.find(a => a.name === "客廳冷氣")!;
  assert.deepEqual([ac.temperature, ac.mode], [26, "暖氣"]);
  assert.equal((await sim.handle(request("/api/hb/devices/ac/客廳冷氣", "POST", { power: "on", temperature: 40 }))).status, 409);
  const offline = createSimulator(createDemoState("offline"));
  assert.equal((await offline.handle(request("/api/hb/devices/ac/客廳冷氣", "POST", { power: "off" }))).status, 503);
});

test("dehumidifier auto mode locks manual control and switching it on decides at once", async () => {
  const sim = createSimulator();
  assert.equal((await sim.handle(request("/api/hb/dehumidifiers/客廳除濕機/control", "POST", { power: "off" }))).status, 409);
  assert.equal((await sim.handle(request("/api/hb/dehumidifiers/臥室除濕機/rule", "PUT", { auto_mode: true, threshold: 50 }))).status, 200);
  const unit = sim.snapshot().dehumidifiers.find(d => d.name === "臥室除濕機")!;
  assert.deepEqual([unit.rule.auto_mode, unit.status.power, unit.rule.last_event], [true, true, "toggled_immediate_on"]);
  assert.equal((await sim.handle(request("/api/hb/dehumidifiers/臥室除濕機/rule", "PUT", { auto_mode: true, threshold: 99 }))).status, 422);
});

test("schedules by id: add, change, cancel; failed and unknown can only be dismissed", async () => {
  const sim = createSimulator();
  const made = await (await sim.handle(request("/api/hb/schedules", "POST", { target_kind: "ac", target_name: "書房冷氣", params: { power: "off" }, due_local: "2026-12-01 23:00" }))).json();
  assert.equal((await sim.handle(request(`/api/hb/schedules/${made.id}`, "PATCH", { due_local: "2026-12-01 23:30" }))).status, 200);
  assert.equal(sim.snapshot().schedules.find(s => s.id === made.id)!.due_local, "2026-12-01 23:30");
  assert.equal((await sim.handle(request(`/api/hb/schedules/${made.id}`, "DELETE"))).status, 200);
  assert.ok(!(await page(sim)).schedules.some(s => s.id === made.id));
  const unknown = sim.snapshot().schedules.find(s => s.status === "unknown")!;
  assert.equal((await sim.handle(request(`/api/hb/schedules/${unknown.id}`, "PATCH", { due_local: "2026-12-01 08:00" }))).status, 409);
  assert.equal((await sim.handle(request(`/api/hb/schedules/${unknown.id}`, "DELETE"))).status, 200);
  assert.equal((await sim.handle(request("/api/hb/schedules", "POST", { target_kind: "ac", target_name: "沒有", due_local: "2026-12-01 23:00" }))).status, 409);
});

test("to-dos: private ones of others are not shown, read-only refuse edits, completion by id", async () => {
  const sim = createSimulator();
  const data = (await (await sim.handle(request("/api/hb/todos"))).json()) as TodoPage;
  assert.ok(!data.todos.some(t => t.title === "另一位成員的私人事項"));
  assert.ok(!("owner" in data.todos[0]));
  const notion = data.todos.find(t => t.read_only)!;
  assert.equal((await sim.handle(request(`/api/hb/todos/${notion.id}`, "PATCH", { title: "x" }))).status, 409);
  const made = await (await sim.handle(request("/api/hb/todos", "POST", { title: "買菜", due_date: "2026-12-01", due_time: "18:00",
    light_reminder: true, light_area_ids: [1] }))).json();
  assert.equal((await sim.handle(request(`/api/hb/todos/${made.item.id}`, "PATCH", { light_area_ids: [99] }))).status, 409);
  assert.equal((await sim.handle(request(`/api/hb/todos/${made.item.id}/complete`, "POST"))).status, 200);
  assert.equal((await sim.handle(request(`/api/hb/todos/${made.item.id}/complete`, "POST"))).status, 409);
  assert.equal((await sim.handle(request("/api/hb/todo-templates", "POST", { title: "澆花", rule: "weekly", weekdays: [1] }))).status, 200);
  assert.equal(((await (await sim.handle(request("/api/hb/todos"))).json()) as TodoPage).templates.length, 2);
});

test("food by id; using it all up removes it", async () => {
  const sim = createSimulator();
  const first = sim.snapshot().food[0];
  assert.equal((await sim.handle(request(`/api/hb/food/${first.id}`, "PATCH", { quantity: 0 }))).status, 200);
  assert.ok(!sim.snapshot().food.some(f => f.id === first.id));
  assert.equal((await sim.handle(request("/api/hb/food", "POST", { name: "牛奶", quantity: 2, expires_on: "2026-12-01" }))).status, 200);
});

test("scenarios are deterministic; failed writes do not persist", async () => {
  assert.deepEqual(createDemoState("empty").todos, []);
  const offline = createSimulator(createDemoState("offline"));
  assert.equal((await offline.handle(request("/api/hb/theater"))).status, 503);
  let persisted = false;
  const fail = createSimulator(createDemoState("error"), () => { persisted = true; });
  assert.equal((await fail.handle(request("/api/hb/food", "POST", { name: "測試" }))).status, 503);
  assert.equal(persisted, false);
  assert.equal((await fail.handle(request("/api/auth/me"))).status, 200);
});

test("fetch interception never forwards unknown API paths, external calls or aborted requests", async () => {
  let networkCalls = 0;
  const original: typeof fetch = async () => { networkCalls++; return Response.json({}); };
  const mock = demoFetch(createSimulator(), origin, original);
  assert.equal((await mock("/api/hb/future-feature", { method: "POST", body: "{}" })).status, 501);
  assert.equal((await mock("/api/old-endpoint")).status, 501);
  assert.equal((await mock("https://example.com/api/hb/devices")).status, 403);
  assert.equal((await mock("/api/auth/device-code", { method: "POST" })).status, 403);
  assert.equal((await mock("/api/hb/food", { method: "POST", body: "broken" })).status, 400);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => mock("/api/hb/food", { signal: controller.signal }));
  assert.equal(networkCalls, 0);
  await mock("/_next/static/test.js");
  assert.equal(networkCalls, 1);
});

test("the door to HomeButler lists every path and role; the tablet gets the devices page only", () => {
  assert.notEqual(findRule("GET", "devices", "remote"), null);
  assert.notEqual(findRule("POST", "devices/ac/客廳冷氣", "remote"), "forbidden");
  assert.equal(findRule("GET", "todos", "remote"), "forbidden");
  assert.equal(findRule("PATCH", "lighting/areas/1", "remote"), "forbidden");
  assert.equal(findRule("GET", "system/status", "member"), null);
  assert.equal(findRule("DELETE", "devices", "member"), null);
  assert.notEqual(findRule("PUT", "rooms/order", "member"), "forbidden");
  assert.equal(findRule("PUT", "rooms/order", "remote"), "forbidden");
  assert.equal(findRule("PATCH", "todos/abc", "member"), null);
});

test("server gate blocks every demo API and backend egress; normal auth stays enforced", async () => {
  const previous = process.env.DASHBOARD_DEMO_MODE;
  const native = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; return Response.json({}); };
  try {
    process.env.DASHBOARD_DEMO_MODE = "1";
    for (const path of ["/api/hb/devices", "/api/auth/device-code", "/api/auth/remote-login", "/api/future-feature", "/api/version"]) {
      assert.equal((await proxy(new NextRequest(origin + path, { method: "POST" }))).status, 503, path);
    }
    await assert.rejects(() => hb("GET", "/v2/devices"), /blocks/);
    assert.equal(networkCalls, 0);
    delete process.env.DASHBOARD_DEMO_MODE;
    const anonymous = await proxy(new NextRequest(origin + "/api/hb/devices", { headers: { cookie: "dashboard_session=demo-local-only" } }));
    assert.equal(anonymous.status, 401);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_DEMO_MODE; else process.env.DASHBOARD_DEMO_MODE = previous;
    globalThis.fetch = native;
  }
});

test("the door signs who is asking and never passes on what the browser claims", async () => {
  const { GET, PATCH } = await import("../src/app/api/hb/[...path]/route");
  const original = globalThis.fetch;
  const ASSERTION = "test-assertion-key-0123456789abcdef";
  process.env.HOME_BUTLER_DASHBOARD_KEY = "test-dashboard-key";
  process.env.DASHBOARD_ASSERTION_KEY = ASSERTION;
  const seen: { url: string; headers: Headers; body: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers), body: (init?.body as string) ?? null });
    return Response.json({ acs: [], presence: [{ name: "沙發區" }] });
  };
  const session = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
  const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
  try {
    assert.equal((await GET(new Request(origin + "/api/hb/todos"), ctx("todos"))).status, 401);
    const alice = await session({ lineUserId: "alice-id", name: "Alice", role: "member" });
    const forged = new Request(origin + "/api/hb/todos/5", { method: "PATCH", headers: { cookie: `dashboard_session=${alice}`,
      "X-Dashboard-Assertion": "forged", Authorization: "Bearer forged" }, body: JSON.stringify({ title: "x" }) });
    assert.equal((await PATCH(forged, ctx("todos", "5"))).status, 200);
    assert.ok(seen[0].url.endsWith("/v2/todos/5"));
    assert.equal(seen[0].body, JSON.stringify({ title: "x" }));
    const claims = (await jwtVerify(seen[0].headers.get("X-Dashboard-Assertion")!, new TextEncoder().encode(ASSERTION))).payload;
    assert.deepEqual([claims.sub, claims.role, claims.aud], ["alice-id", "member", "homebutler"]);
    assert.ok((claims.exp! - claims.iat!) <= 300);
    const tablet = await session({ lineUserId: "remote", name: "平板", role: "remote", remoteId: 3 });
    const asTablet = (path: string[]) => GET(new Request(origin + "/api/hb/" + path.join("/"), { headers: { cookie: `dashboard_session=${tablet}` } }), ctx(...path));
    assert.equal((await asTablet(["todos"])).status, 403);
    const devices = await (await asTablet(["devices"])).json();
    assert.equal(devices.zone_editor, false);                      // presence is left out by HomeButler itself
    assert.equal((await jwtVerify(seen.at(-1)!.headers.get("X-Dashboard-Assertion")!, new TextEncoder().encode(ASSERTION))).payload.role, "remote");
    assert.equal((await jwtVerify(seen.at(-1)!.headers.get("X-Dashboard-Assertion")!, new TextEncoder().encode(ASSERTION))).payload.sub, "3");
    assert.equal((await asTablet(["..", "system"])).status, 404);
    const oldTablet = await session({ lineUserId: "remote", name: "平板", role: "remote" });
    assert.equal((await GET(new Request(origin + "/api/hb/devices", { headers: { cookie: `dashboard_session=${oldTablet}` } }), ctx("devices"))).status, 401);
    assert.equal(seen.every(s => s.headers.get("Authorization") === "Bearer test-dashboard-key"), true);
    delete process.env.DASHBOARD_ASSERTION_KEY;
    const unset = await GET(new Request(origin + "/api/hb/todos", { headers: { cookie: `dashboard_session=${alice}` } }), ctx("todos"));
    assert.equal(unset.status, 503);                                // never signs with an empty key
  } finally {
    globalThis.fetch = original;
    delete process.env.HOME_BUTLER_DASHBOARD_KEY;
    delete process.env.DASHBOARD_ASSERTION_KEY;
  }
});
