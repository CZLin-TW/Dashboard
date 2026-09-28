import assert from "node:assert/strict";
import test from "node:test";
import { toFormInitial, updateSchedule, type Schedule } from "../src/lib/schedule";
import { createDemoState } from "../src/lib/demo/fixtures";
import { createSimulator } from "../src/lib/demo/simulator";

const original: Schedule = {
  設備名稱: "測試空調", 動作: "control_ac", 參數: '{"power":"off"}',
  觸發時間: "2026-09-29 7:00", 來源: "自動（HA）", 狀態: "待執行",
};

test("schedule editor accepts unpadded Sheet times without changing the clock time", () => {
  for (const [raw, date, time] of [
    ["2026-09-29 7:00", "2026-09-29", "07:00"],
    ["2026-9-2 0:05", "2026-09-02", "00:05"],
    [" 2026-09-29   7:00 ", "2026-09-29", "07:00"],
    ["2026-09-29 12:30", "2026-09-29", "12:30"],
    ["2026-09-29 23:59", "2026-09-29", "23:59"],
  ]) {
    const initial = toFormInitial({ ...original, 觸發時間: raw }, undefined);
    assert.equal(initial.trigger_date, date, raw);
    assert.equal(initial.trigger_time, time, raw);
  }
});

test("padding the form time alone does not rewrite a schedule", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
  assert.equal(await updateSchedule(original, {
    device_name: original.設備名稱, target_action: original.動作,
    params: { power: "off" }, trigger_time: "2026-09-29 07:00",
  }, "測試成員"), false);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("editing a time keeps the original Sheet string for identifying the row", async (t) => {
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response("{}");
  });
  await updateSchedule(original, {
    device_name: original.設備名稱, target_action: original.動作,
    params: { power: "off" }, trigger_time: "2026-09-29 08:15",
  }, "測試成員");
  assert.equal(body.trigger_time, "2026-09-29 7:00");
  assert.equal(body.trigger_time_new, "2026-09-29 08:15");
});

test("automatic unpadded schedule survives edit, save and reload with provenance intact", async (t) => {
  const sim = createSimulator(createDemoState());
  const before = sim.snapshot();
  const schedule = before.schedules.find(s => s.來源 === "自動（HA）")!;
  const device = before.devices.find(d => d.name === schedule.設備名稱)!;
  const initial = toFormInitial(schedule, device);
  assert.equal(initial.trigger_time, "07:00");
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) =>
    sim.handle(new Request(`http://demo${url}`, init)));
  assert.equal(await updateSchedule(schedule, {
    device_name: initial.device_name, target_action: schedule.動作,
    params: { power: "off" }, trigger_time: `${initial.trigger_date} 08:15`,
  }, "測試成員"), true);
  const reloaded = createSimulator(sim.snapshot()).snapshot();
  const saved = reloaded.schedules.find(s => s.來源 === "自動（HA）")!;
  assert.equal(toFormInitial(saved, device).trigger_time, "08:15");
  assert.equal(JSON.parse(saved.參數)._auto_hours, 9);
  assert.deepEqual(reloaded.devices, before.devices);
});
