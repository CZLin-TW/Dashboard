import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { isDemoMode } from "../src/lib/demo/config";
import { createDemoState, monitoring } from "../src/lib/demo/fixtures";
import { createSimulator, demoFetch } from "../src/lib/demo/simulator";
import { proxy } from "../src/proxy";
import { butlerGet, butlerPost } from "../src/lib/butler";

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
  await sim.handle(request("/api/dehumidifier/auto-rule", "POST", { device_name: "客廳除濕機", auto_mode: false }));
  assert.equal((await sim.handle(request("/api/devices/control", "POST", { deviceName: "客廳除濕機", action: "dehumidifier", params: { power: false } }))).status, 200);
  await sim.handle(request("/api/schedules", "POST", { device_name: "循環扇", trigger_time: "2026-10-01 20:00", target_action: "control_ir", params: { button: "電源" } }));
  await sim.handle(request("/api/schedules", "PATCH", { device_name: "循環扇", trigger_time: "2026-10-01 20:00", trigger_time_new: "2026-10-01 21:00" }));
  assert.ok(sim.snapshot().schedules.some(s => s.觸發時間 === "2026-10-01 21:00"));
  await sim.handle(request("/api/schedules", "DELETE", { device_name: "循環扇", trigger_time: "2026-10-01 21:00" }));
  assert.equal(sim.snapshot().schedules.length, 1);
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
