import assert from "node:assert/strict";
import test from "node:test";
import { autoOffSummary } from "../src/lib/ac";
import { scheduleText, toFormInitial, updateSchedule } from "../src/lib/schedule";
import type { Schedule } from "../src/lib/api";

test("settings summary states what the backend read and flags unreadable cells", () => {
  const now = new Date(2026, 9, 11, 20, 0);
  const base = { status: "waiting_power", scheduled_at: null, hours_text: "1", window_text: "" };
  assert.deepEqual(autoOffSummary({ ...base, hours: 1, problems: [], window: "07:00-07:00", preview_off_at: "2026-10-12 07:00" }, now),
    { text: "自動關機：開機後 1 小時，一律等到 07:00。若現在開機，會排在明天 07:00 關。", warnings: [] });
  assert.equal(autoOffSummary({ ...base, hours: 3, problems: [], window: "22:00-07:00", preview_off_at: "2026-10-11 21:30" }, now)!.text,
    "自動關機：開機後 3 小時，落在 22:00–07:00 之間延到 07:00。若現在開機，會排在今天 21:30 關。");
  assert.deepEqual(autoOffSummary({ ...base, hours: 0, problems: [], window: null, preview_off_at: null }, now), { text: "自動關機：未啟用", warnings: [] });
  const typo = autoOffSummary({ ...base, hours: 1, window_text: "7點-7點", problems: ["window_unreadable"], window: null, preview_off_at: "2026-10-11 21:00" }, now)!;
  assert.match(typo.warnings[0], /「7點-7點」，無法辨識.*目前不會暫緩/);
  assert.equal(autoOffSummary(undefined, now), null);
});

const schedule: Schedule = { id: 7, target_kind: "ac", target_name: "冷氣", params: { power: "on", temperature: 27, mode: "cool", fan_speed: "auto" },
  due_at: "2026-12-01T15:00:00Z", due_local: "2026-12-01 23:00", source: "auto_off", status: "pending", status_label: "待執行",
  result: "", created_by: "系統", editable: true };

test("a schedule reads as what it does, and its form starts from it", () => {
  assert.equal(scheduleText(schedule.params), "開機 · 27°C · 冷氣 · 風速:自動");
  assert.equal(scheduleText({ power: "off" }), "關機");
  assert.equal(scheduleText({ button: "電源" }), "電源");
  const initial = toFormInitial(schedule);
  assert.deepEqual([initial.trigger_date, initial.trigger_time, initial.ac?.temperature, initial.ac?.mode], ["2026-12-01", "23:00", 27, "cool"]);
});

test("an edit sends only what changed, by id; nothing changed sends nothing", async (t) => {
  const bodies: { url: string; body: unknown }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    bodies.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json({});
  });
  const same = { kind: "ac" as const, name: "冷氣", params: { fan_speed: "auto", mode: "cool", temperature: 27, power: "on" }, due_local: "2026-12-01 23:00" };
  assert.equal(await updateSchedule(schedule, same), false);
  assert.equal(await updateSchedule(schedule, { ...same, due_local: "2026-12-01 23:30" }), true);
  assert.deepEqual(bodies, [{ url: "/api/hb/schedules/7", body: { due_local: "2026-12-01 23:30" } }]);
});
