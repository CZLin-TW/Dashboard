import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState } from "../src/lib/demo/fixtures";
import { createSimulator } from "../src/lib/demo/simulator";
import { parseScheduleParams } from "../src/lib/schedule";
import { autoOffSummary } from "../src/lib/ac";
import { proxy } from "../src/proxy";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";

test("generated shutdown is editable and preserves internal provenance", async () => {
  const sim = createSimulator(createDemoState());
  const original = sim.snapshot().schedules.find(s => s.來源 === "自動（HA）")!;
  const response = await sim.handle(new Request("http://demo/api/schedules", {method:"PATCH", body:JSON.stringify({
    device_name:original.設備名稱,trigger_time:original.觸發時間,trigger_time_new:"2026-12-01 08:00",
    params_new:{power:"off",_auto_closed:true,_auto_hours:1},person:"測試成員"})}));
  assert.equal(response.status,200);
  const changed = sim.snapshot().schedules.find(s => s.來源 === "自動（HA）")!;
  assert.equal(changed.觸發時間,"2026-12-01 08:00");
  assert.equal(JSON.parse(changed.參數)._auto_hours,9);
  assert.equal(JSON.parse(changed.參數)._auto_closed,undefined);
  assert.equal(parseScheduleParams(changed.參數).display,"關機");
});

test("deleted cycle stays hidden across reload and leaves unrelated schedules intact", async () => {
  const sim = createSimulator(createDemoState());
  const before = sim.snapshot();
  const original = before.schedules.find(s => s.來源 === "自動（HA）")!;
  assert.equal((await sim.handle(new Request("http://demo/api/schedules",{method:"DELETE",body:JSON.stringify({
    device_name:original.設備名稱,trigger_time:original.觸發時間})}))).status,200);
  const after = createSimulator(sim.snapshot());
  const visible = await (await after.handle(new Request("http://demo/api/schedules"))).json();
  assert.deepEqual(visible,before.schedules.filter(s => s.來源 !== "自動（HA）"));
  assert.deepEqual(after.snapshot().devices,before.devices);
  assert.equal(after.snapshot().schedules.find(s => s.來源 === "自動（HA）")!.狀態,"已取消");
});

test("unknown automatic outcome cannot be edited but can be removed", async () => {
  const state = createDemoState();
  const original = state.schedules.find(s => s.來源 === "自動（HA）")!;
  original.狀態="待確認"; original.執行識別碼="unknown-auto";
  const sim = createSimulator(state);
  const body = {device_name:original.設備名稱,trigger_time:original.觸發時間};
  assert.equal((await sim.handle(new Request("http://demo/api/schedules",{method:"PATCH",body:JSON.stringify({...body,trigger_time_new:"2026-12-01 08:00"})}))).status,404);
  assert.equal((await sim.handle(new Request("http://demo/api/schedules",{method:"DELETE",body:JSON.stringify({...body,execution_id:original.執行識別碼})}))).status,200);
  const visible = await (await sim.handle(new Request("http://demo/api/schedules"))).json();
  assert.ok(!visible.some((s: {來源:string}) => s.來源 === "自動（HA）"));
});

test("settings summary states what the backend read and flags unreadable cells", () => {
  const now = new Date(2026, 9, 11, 20, 0);
  const base = { status: "waiting_power", scheduled_at: null, hours_text: "1", window_text: "" };
  assert.deepEqual(autoOffSummary({ ...base, hours: 1, problems: [], window: "07:00-07:00", preview_off_at: "2026-10-12 07:00" }, now),
    { text: "自動關機：開機後 1 小時，一律等到 07:00。若現在開機，會排在明天 07:00 關。", warnings: [] });
  assert.equal(autoOffSummary({ ...base, hours: 3, problems: [], window: "22:00-07:00", preview_off_at: "2026-10-11 21:30" }, now)!.text,
    "自動關機：開機後 3 小時，落在 22:00–07:00 之間延到 07:00。若現在開機，會排在今天 21:30 關。");
  assert.equal(autoOffSummary({ ...base, hours: 8, problems: [], window: null, preview_off_at: "2026-10-14 04:00" }, now)!.text,
    "自動關機：開機後 8 小時。若現在開機，會排在10/14 04:00 關。");
  assert.deepEqual(autoOffSummary({ ...base, hours: 0, problems: [], window: null, preview_off_at: null }, now), { text: "自動關機：未啟用", warnings: [] });
  const typo = autoOffSummary({ ...base, hours: 1, window_text: "7點-7點", problems: ["window_unreadable"], window: null, preview_off_at: "2026-10-11 21:00" }, now)!;
  assert.match(typo.text, /開機後 1 小時。若現在開機，會排在今天 21:00 關。$/);
  assert.match(typo.warnings[0], /「7點-7點」，無法辨識.*目前不會暫緩/);
  const off = autoOffSummary({ ...base, hours: 0, hours_text: "一", problems: ["hours_unreadable", "future_code"], window: null, preview_off_at: null }, now)!;
  assert.equal(off.text, "自動關機：未啟用");
  assert.equal(off.warnings.length, 2);
  assert.match(off.warnings[0], /「一」，無法辨識.*目前不會自動關機/);
  assert.match(autoOffSummary({ ...base, hours: 0, problems: ["window_without_hours"], window: "22:00-07:00", preview_off_at: null }, now)!.warnings[0], /自動關機沒有啟用/);
  // An older backend without the settings fields shows nothing rather than a guess.
  assert.equal(autoOffSummary({ hours: 3, status: "counting", scheduled_at: null }, now), null);
  assert.equal(autoOffSummary(undefined, now), null);
});

test("demo serves the read-only settings route and the kid remote may read it", async () => {
  const sim = createSimulator(createDemoState());
  const response = await sim.handle(new Request("http://demo/api/ac/auto-off"));
  assert.equal(response.status, 200);
  const info = (await response.json()).devices["HA 測試空調"];
  assert.deepEqual(info.problems, []);
  assert.ok(autoOffSummary(info)!.text.includes("落在 22:00–07:00 之間延到 07:00"));
  assert.equal((await sim.handle(new Request("http://demo/api/ac/auto-off", { method: "POST", body: "{}" }))).status, 501);
  const token = await new SignJWT({ lineUserId: "kid-id", name: "Kid", role: "kid" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(JWT_SECRET);
  const visit = (path: string) => proxy(new NextRequest(`http://dashboard.test${path}`, { headers: { cookie: `dashboard_session=${token}` } }));
  assert.equal((await visit("/api/ac/auto-off")).status, 200);
  assert.equal((await visit("/api/ac/auto-off/other")).status, 403);
});
