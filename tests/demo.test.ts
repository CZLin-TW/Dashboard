import { SignJWT } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";
import { GET as todosGET, PATCH as todosPATCH } from "../src/app/api/todos/route";
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { isDemoMode } from "../src/lib/demo/config";
import { createDemoState, monitoring } from "../src/lib/demo/fixtures";
import { createSimulator, demoFetch } from "../src/lib/demo/simulator";
import { proxy } from "../src/proxy";
import { butlerGet, butlerPost } from "../src/lib/butler";
import { GET as dashboardGET } from "../src/app/api/dashboard/route";
import { GET as sensorsGET } from "../src/app/api/sensors/status/route";
import { GET as feedbackGET, POST as feedbackPOST } from "../src/app/api/ac/feedback/route";
import { AC_FEEDBACK_DEFAULTS } from "../src/lib/ac-feedback";
import { acAcceptedTemperature, acPendingFromDevice } from "../src/lib/types";

const origin = "http://127.0.0.1:3001";
function request(path: string, method = "GET", body?: unknown) {
  return new Request(origin + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) });
}

test("demo requires server opt-in, rejects production and real credentials", () => {
  assert.equal(isDemoMode({}), false);
  assert.equal(isDemoMode({ DASHBOARD_DEMO_MODE: "true" }), false);
  assert.equal(isDemoMode({ DASHBOARD_DEMO_MODE: "1", VERCEL_ENV: "preview" }), true);
  assert.throws(() => isDemoMode({ DASHBOARD_DEMO_MODE: "1", VERCEL_ENV: "production" }));
  for (const name of ["HOME_BUTLER_API_KEY", "SESSION_JWT_SECRET", "LINE_LOGIN_CHANNEL_SECRET"]) {
    assert.throws(() => isDemoMode({ DASHBOARD_DEMO_MODE: "1", [name]: "fixture-not-a-secret" }));
  }
});

test("cold start has useful charts, identity and all page data contracts", async () => {
  const sim = createSimulator();
  for (const path of ["auth/me", "dashboard", "devices", "devices/options", "devices/status", "sensors/status", "ac/status", "dehumidifier/history", "computers/status", "dehumidifier/auto-rule", "todos", "food", "schedules", "recurring-todos", "lighting/areas", "lighting/auto/rules", "lighting/auto/sensors", "theater/summary"]) {
    assert.equal((await sim.handle(request(`/api/${path}`))).status, 200, path);
  }
  const data = monitoring(sim.snapshot());
  assert.equal(data.sensors["客廳感測器"].history.length, 289);
  assert.equal(Object.values(data.computers)[0].history.length, 1441);
  assert.equal((await (await sim.handle(request("/api/auth/me"))).json()).name, "測試成員");
});

test("homepage summaries omit history and weather while preserving current readings and legacy responses", async () => {
  const sim = createSimulator();
  const get = async (path: string) => (await sim.handle(request(path))).json();
  const life = await get("/api/dashboard?include_weather=false");
  assert.deepEqual(Object.keys(life).sort(), ["food", "todos"]);
  assert.ok((await get("/api/dashboard")).weatherToday);
  const summary = await get("/api/sensors/status?include_history=false");
  const full = await get("/api/sensors/status");
  assert.equal(summary["客廳感測器"].current.co2, full["客廳感測器"].current.co2);
  assert.equal(summary["客廳感測器"].history.length, 0);
  assert.ok(full["客廳感測器"].history.length > 0);
  assert.ok(JSON.stringify(summary).length < JSON.stringify(full).length / 20);
  const selected = await get(`/api/sensors/status?name=${encodeURIComponent("客廳感測器")}`);
  assert.deepEqual(Object.keys(selected), ["客廳感測器"]);
  assert.ok(selected["客廳感測器"].history.length > 0);
  assert.deepEqual(await get("/api/sensors/status?name=missing"), {});
});

test("proxy forwards explicit light queries and encoded sensor names, preserving legacy defaults", async () => {
  const native = globalThis.fetch;
  const previous = process.env.DASHBOARD_DEMO_MODE;
  const seen: string[] = [];
  delete process.env.DASHBOARD_DEMO_MODE;
  globalThis.fetch = async (input) => { seen.push(String(input)); return Response.json({}); };
  try {
    const token = await new SignJWT({ lineUserId: "fake-member", name: "測試成員", role: "member" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
    const signed = (path: string) => new Request(origin + path, { headers: { cookie: `dashboard_session=${token}` } });
    await dashboardGET(signed("/api/dashboard"));
    await dashboardGET(signed("/api/dashboard?include_weather=false"));
    await sensorsGET(request("/api/sensors/status"));
    await sensorsGET(request(`/api/sensors/status?include_history=false&name=${encodeURIComponent("客廳 & 臥室")}`));
    assert.equal(new URL(seen[0]).search, "");
    assert.equal(new URL(seen[1]).searchParams.get("include_weather"), "false");
    assert.equal(new URL(seen[2]).search, "");
    assert.equal(new URL(seen[3]).searchParams.get("name"), "客廳 & 臥室");
    assert.equal(new URL(seen[3]).searchParams.get("include_history"), "false");
  } finally {
    globalThis.fetch = native;
    if (previous === undefined) delete process.env.DASHBOARD_DEMO_MODE; else process.env.DASHBOARD_DEMO_MODE = previous;
  }
});

test("AC writes are confirmed by status polling, survive reload, and isolate sessions", async () => {
  let saved = createDemoState();
  const sim = createSimulator(saved, state => { saved = state; });
  const other = createSimulator();
  const body = { deviceName: "客廳冷氣", action: "setAll", params: { power: true, temperature: 24, mode: "冷氣", fanSpeed: "高" } };
  assert.equal((await sim.handle(request("/api/devices/control", "POST", body))).status, 200);
  const reloaded = createSimulator(JSON.parse(JSON.stringify(saved)));
  const statuses = await (await reloaded.handle(request("/api/devices/status?name=" + encodeURIComponent("客廳冷氣")))).json();
  assert.equal(statuses["客廳冷氣"].lastTemperature, 24);
  assert.equal(other.snapshot().devices[0].lastTemperature, 26);
  assert.equal((await sim.handle(request("/api/devices/control", "POST", { ...body, params: { ...body.params, temperature: 100 } }))).status, 400);
  assert.equal((await sim.handle(request("/api/devices/control", "POST", { deviceName: "客廳除濕機", action: "dehumidifier", params: { power: false } }))).status, 409);
});

test("feedback settings persist without operating AC or changing comfort target and schedules", async () => {
  let saved = createDemoState();
  const sim = createSimulator(saved, state => { saved = state; });
  const before = sim.snapshot();
  const config = { ...AC_FEEDBACK_DEFAULTS, enabled: true, sensor_name: "客廳感測器", interval_min: 1, min_adjust_min: 1 };
  assert.equal((await sim.handle(request("/api/ac/feedback", "POST", { device_name: "客廳冷氣", config }))).status, 200);
  assert.deepEqual(sim.snapshot().devices, before.devices);
  assert.deepEqual(sim.snapshot().schedules, before.schedules);
  const reloaded = createSimulator(JSON.parse(JSON.stringify(saved)));
  const read = async () => (await (await reloaded.handle(request("/api/ac/feedback"))).json()).devices["客廳冷氣"];
  assert.equal((await read()).config.interval_min, 1);
  assert.equal((await read()).config.min_adjust_min, 1);
  assert.equal((await read()).target_temperature, 26);
  assert.equal((await read()).ir_temperature, 25);
  await reloaded.handle(request("/api/ac/feedback", "POST", { device_name: "客廳冷氣", config: { ...config, enabled: false } }));
  assert.equal((await read()).ir_temperature, 25);
  await reloaded.handle(request("/api/devices/control", "POST", { deviceName: "客廳冷氣", action: "setAll", params: { power: true, temperature: 27, mode: "冷氣", fanSpeed: "低" } }));
  assert.equal((await read()).target_temperature, 27);
  assert.equal((await read()).ir_temperature, 27);
  for (const invalid of [{ step: 3 }, { interval_min: 0 }, { min_adjust_min: 0 }, { interval_min: 0.5 }, { min_adjust_min: 0.5 }, { interval_min: 31 }, { min_adjust_min: 61 }, { tolerance: null }, { sensor_name: "主臥感測器" }, { enabled: "true" }, { power: "on" }]) {
    assert.equal((await sim.handle(request("/api/ac/feedback", "POST", { device_name: "客廳冷氣", config: { ...config, ...invalid } }))).status, 422);
  }
});

test("feedback routes reject anonymous and kid sessions before contacting backend", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ devices: {}, sensors: [] }); };
  try {
    assert.equal((await feedbackGET(request("/api/ac/feedback"))).status, 401);
    assert.equal((await feedbackPOST(request("/api/ac/feedback", "POST", {}))).status, 401);
    const kid = await new SignJWT({ lineUserId: "kid-id", role: "kid" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
    for (const handler of [feedbackGET, feedbackPOST]) {
      assert.equal((await handler(new Request(origin + "/api/ac/feedback", { headers: { cookie: `dashboard_session=${kid}` } }))).status, 403);
    }
    assert.equal(calls, 0);
    const member = await new SignJWT({ lineUserId: "member-id", role: "member" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
    assert.equal((await feedbackGET(new Request(origin + "/api/ac/feedback", { headers: { cookie: `dashboard_session=${member}` } }))).status, 200);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("explicit feedback evaluation adjusts only IR once and reports skipped conditions", async () => {
  const initial = createDemoState();
  initial.devices.find(d => d.name === "客廳感測器")!.temperature = 28;
  const sim = createSimulator(initial);
  const config = { ...AC_FEEDBACK_DEFAULTS, enabled: true, sensor_name: "客廳感測器" };
  const evaluate = async (body: object) => (await (await sim.handle(request("/api/ac/feedback", "POST", { device_name: "客廳冷氣", evaluate_now: true, ...body }))).json());
  assert.equal((await evaluate({ config })).evaluation.status, "compensating");
  assert.equal(sim.snapshot().acFeedback!["客廳冷氣"].ir_temperature, 24);
  assert.deepEqual(sim.snapshot().devices, initial.devices);
  assert.deepEqual(sim.snapshot().schedules, initial.schedules);
  const repeated = await evaluate({});
  assert.equal(repeated.evaluation.status, "waiting_sample");
  assert.equal(repeated.config, undefined);
  assert.equal(sim.snapshot().acFeedback!["客廳冷氣"].ir_temperature, 24);
  assert.equal((await evaluate({ config: { ...config, enabled: false } })).evaluation.status, "disabled");
  const offline = createSimulator(createDemoState("offline"));
  const result = await (await offline.handle(request("/api/ac/feedback", "POST", { device_name: "客廳冷氣", config, evaluate_now: true }))).json();
  assert.equal(result.evaluation.status, "sensor_stale");
});

test("half-degree targets round only without feedback and disabling preserves the IR setting", async () => {
  const sim = createSimulator();
  const send = async (temperature: number) => sim.handle(request("/api/devices/control", "POST", {
    deviceName: "客廳冷氣", action: "setAll", params: { power: true, temperature, mode: "冷氣", fanSpeed: "低" },
  }));
  const rounded = await (await send(26.5)).json();
  assert.equal(rounded.state.lastTemperature, 27);
  assert.equal(acAcceptedTemperature(26.5, rounded.state), 27);
  const config = { ...AC_FEEDBACK_DEFAULTS, enabled: true, sensor_name: "客廳感測器" };
  await sim.handle(request("/api/ac/feedback", "POST", { device_name: "客廳冷氣", config }));
  const precise = await (await send(26.5)).json();
  assert.equal(precise.state.lastTemperature, 26.5);
  assert.equal(acAcceptedTemperature(26.5, precise.state), 26.5);
  assert.equal(acPendingFromDevice({ ...precise.state, lastTemperature: "26.5" }).temperature, 26.5);
  assert.equal(sim.snapshot().acFeedback!["客廳冷氣"].ir_temperature, 27);
  const before = sim.snapshot();
  await sim.handle(request("/api/ac/feedback", "POST", { device_name: "客廳冷氣", config: { ...config, enabled: false } }));
  assert.equal(sim.snapshot().devices[0].lastTemperature, 27);
  assert.equal(sim.snapshot().acFeedback!["客廳冷氣"].ir_temperature, before.acFeedback!["客廳冷氣"].ir_temperature);
  assert.equal(sim.snapshot().devices[0].lastPower, before.devices[0].lastPower);
  assert.deepEqual(sim.snapshot().schedules, before.schedules);
  assert.equal((await send(26.2)).status, 400);
  assert.equal(acAcceptedTemperature(26.5), 26.5); // Old server: no guessed normalization.
});

test("todo and food CRUD change data; readonly entries reject edits", async () => {
  const sim = createSimulator();
  await sim.handle(request("/api/todos", "POST", { item: "測試事項", date: "2026-10-01" }));
  await sim.handle(request("/api/todos", "PATCH", { item: "測試事項", item_new: "修改事項" }));
  assert.ok(sim.snapshot().todos.some(t => t.事項 === "修改事項"));
  await sim.handle(request("/api/todos?item=" + encodeURIComponent("修改事項"), "DELETE"));
  assert.ok(!sim.snapshot().todos.some(t => t.事項 === "修改事項"));
  const readonly = sim.snapshot().todos.find(t => t.屬性 === "唯讀")!;
  assert.equal((await sim.handle(request("/api/todos", "PATCH", { item: readonly.事項, item_new: "不可改" }))).status, 403);
  await sim.handle(request("/api/food", "POST", { name: "測試優格", expiry: "2026-10-02", quantity: 2 }));
  await sim.handle(request("/api/food", "PATCH", { name: "測試優格", quantity: 3 }));
  assert.equal(sim.snapshot().food.find(f => f.品名 === "測試優格")?.數量, "3");
  await sim.handle(request("/api/food?name=" + encodeURIComponent("測試優格"), "DELETE"));
  assert.ok(!sim.snapshot().food.some(f => f.品名 === "測試優格"));
});

test("lighting, auto-rule, theater and schedule writes read back", async () => {
  const sim = createSimulator();
  await sim.handle(request("/api/lighting/areas/demo-living/state", "PATCH", { on: false }));
  assert.equal(sim.snapshot().areas[0].on, false);
  await sim.handle(request("/api/lighting/scenes/demo-scene-0-night/recall", "POST", {}));
  assert.equal(sim.snapshot().areas[0].brightness, 20);
  await sim.handle(request("/api/lighting/auto/rules/demo-living", "PATCH", { enabled: true, threshold: 5 }));
  assert.equal(sim.snapshot().lightingRules["demo-living"].threshold, 5);
  await sim.handle(request("/api/theater/flags", "POST", { kef_link: false }));
  assert.equal(sim.snapshot().theater.flags.kef_link, false);
  assert.equal(sim.snapshot().theater.health?.appletv?.stale, false);
  await sim.handle(request("/api/dehumidifier/auto-rule", "POST", { device_name: "客廳除濕機", auto_mode: false }));
  assert.equal((await sim.handle(request("/api/devices/control", "POST", { deviceName: "客廳除濕機", action: "dehumidifier", params: { power: false } }))).status, 200);
  await sim.handle(request("/api/schedules", "POST", { device_name: "循環扇", trigger_time: "2026-10-01 20:00", target_action: "control_ir", params: { button: "電源" } }));
  await sim.handle(request("/api/schedules", "PATCH", { device_name: "循環扇", trigger_time: "2026-10-01 20:00", trigger_time_new: "2026-10-01 21:00" }));
  assert.ok(sim.snapshot().schedules.some(s => s.觸發時間 === "2026-10-01 21:00"));
  await sim.handle(request("/api/schedules", "DELETE", { device_name: "循環扇", trigger_time: "2026-10-01 21:00" }));
  assert.equal(sim.snapshot().schedules.length, 3);
});

test("attention records stay visible and removal targets only the specified attempt", async () => {
  const sim = createSimulator();
  const failed = sim.snapshot().schedules.find(s => s.狀態 === "執行失敗")!;
  const body = { device_name: failed.設備名稱, trigger_time: failed.觸發時間 };
  assert.equal((await sim.handle(request("/api/schedules", "PATCH", { ...body, trigger_time_new: "2026-10-01 22:00" }))).status, 404);
  await sim.handle(request("/api/schedules", "POST", { ...body, target_action: "control_ac", params: { power: "on" } }));
  await sim.handle(request("/api/schedules", "DELETE", { ...body, execution_id: failed.執行識別碼 }));
  const rows = await (await sim.handle(request("/api/schedules"))).json();
  assert.ok(rows.some((s: Record<string, string>) => s.設備名稱 === failed.設備名稱 && s.觸發時間 === failed.觸發時間 && s.狀態 === "待執行"));
  assert.ok(rows.some((s: Record<string, string>) => s.狀態 === "待確認"));
  assert.ok(!rows.some((s: Record<string, string>) => s.執行識別碼 === failed.執行識別碼));
});

test("empty/offline/error scenarios are deterministic; failed writes do not persist", async () => {
  assert.deepEqual(createDemoState("empty").todos, []);
  const offline = createSimulator(createDemoState("offline"));
  assert.equal((await offline.handle(request("/api/theater/summary"))).status, 503);
  let persisted = false;
  const fail = createSimulator(createDemoState("error"), () => { persisted = true; });
  assert.equal((await fail.handle(request("/api/food", "POST", { name: "測試" }))).status, 503);
  assert.equal(persisted, false);
  assert.equal((await fail.handle(request("/api/auth/me"))).status, 200);
});

test("fetch interception never forwards unknown API paths, external calls or aborted requests", async () => {
  let networkCalls = 0;
  const original: typeof fetch = async () => { networkCalls++; return Response.json({}); };
  const mock = demoFetch(createSimulator(), origin, original);
  assert.equal((await mock("/api/future-feature", { method: "POST", body: "{}" })).status, 501);
  assert.equal((await mock("https://example.com/api/devices")).status, 403);
  assert.equal((await mock("/api/auth/device-code", { method: "POST" })).status, 403);
  assert.equal((await mock("/api/food", { method: "POST", body: "broken" })).status, 400);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => mock("/api/food", { signal: controller.signal }));
  assert.equal(networkCalls, 0);
  await mock("/_next/static/test.js");
  assert.equal(networkCalls, 1);
});

test("server gate blocks every demo API and backend egress; normal auth stays enforced", async () => {
  const previous = process.env.DASHBOARD_DEMO_MODE;
  const native = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; return Response.json({}); };
  try {
    process.env.DASHBOARD_DEMO_MODE = "1";
    for (const path of ["/api/devices/control", "/api/auth/device-code", "/api/auth/remote-login", "/api/future-feature", "/api/version"]) {
      const response = await proxy(new NextRequest(origin + path, { method: "POST" }));
      assert.equal(response.status, 503, path);
    }
    await assert.rejects(() => butlerGet("/api/devices"), /blocks/);
    await assert.rejects(() => butlerPost("/api/devices/control/ac", {}), /blocks/);
    assert.equal(networkCalls, 0);
    delete process.env.DASHBOARD_DEMO_MODE;
    const anonymous = await proxy(new NextRequest(origin + "/api/devices?demo=1", { headers: { "X-Demo-Mode": "1", cookie: "dashboard_session=demo-local-only" } }));
    assert.equal(anonymous.status, 401);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_DEMO_MODE; else process.env.DASHBOARD_DEMO_MODE = previous;
    globalThis.fetch = native;
  }
});


test("private routes reject forged headers and forward only the verified member ID", async () => {
  const original = globalThis.fetch;
  const seen: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => { seen.push(init || {}); return Response.json([]); };
  try {
    assert.equal((await todosGET(new Request(origin + "/api/todos", { headers: { "X-Dashboard-User": "victim" } }))).status, 401);
    assert.equal(seen.length, 0);
    const token = await new SignJWT({ lineUserId: "alice-id", name: "Alice", role: "member" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
    const req = new Request(origin + "/api/todos", { method: "PATCH", headers: { cookie: `dashboard_session=${token}`, "X-Dashboard-User": "victim", "Content-Type": "application/json" }, body: JSON.stringify({ item: "x", todo_id: "id-x", requester: "victim" }) });
    assert.equal((await todosPATCH(req)).status, 200);
    assert.equal(new Headers(seen[0].headers).get("X-Dashboard-User"), "alice-id");
    const kid = await new SignJWT({ lineUserId: "kid-id", role: "kid" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
    assert.equal((await todosGET(new Request(origin + "/api/todos", { headers: { cookie: `dashboard_session=${kid}` } }))).status, 403);
    assert.equal(seen.length, 1);
  } finally { globalThis.fetch = original; }
});

test("demo enforces private visibility and stable IDs after renames", async () => {
  const sim = createSimulator();
  const hidden = sim.snapshot().todos.find(t => t.負責人 === "其他成員")!;
  const visible = await (await sim.handle(request("/api/todos"))).json();
  assert.ok(!visible.some((t: Record<string, string>) => t.待辦ID === hidden.待辦ID));
  assert.equal((await sim.handle(request("/api/todos", "PATCH", { todo_id: hidden.待辦ID, item: hidden.事項, requester: "其他成員" }))).status, 404);
  const own = sim.snapshot().todos[0];
  await sim.handle(request("/api/todos", "PATCH", { todo_id: own.待辦ID, item_new: "renamed" }));
  await sim.handle(request("/api/todos?todo_id=" + encodeURIComponent(own.待辦ID!), "DELETE"));
  assert.ok(!sim.snapshot().todos.some(t => t.待辦ID === own.待辦ID));
});
