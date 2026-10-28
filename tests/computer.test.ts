import assert from "node:assert/strict";
import test from "node:test";
import { formatComputerMetric, toChartHistory, validSocTemperature, memoryPressureDisplay, validMemoryPressure, memoryPressureColor, validSystemPower, powerAxisMax, watchdogViews, watchdogSummary } from "../src/lib/computer";

test("computer metrics distinguish unavailable from real zero and preserve history gaps", () => {
  for (const value of [null, undefined, NaN, Infinity]) {
    assert.equal(formatComputerMetric(value, "°C"), "unavailable");
  }
  assert.equal(formatComputerMetric(0, "%"), "0%");
  assert.equal(formatComputerMetric(42.4, "°C"), "42°C");
  const point = { t: 1000, cpu_pct: 0, ram_pct: 50, gpu_pct: null, cpu_temp_c: null, gpu_temp_c: null };
  const result = toChartHistory([point, { ...point, t: 1200 }]);
  assert.equal(result.length, 3);
  assert.equal(result[0].cpu, 0);
  assert.equal(result[1].cpu, null);
  assert.ok(result.every(p => p.cpuTemp === null && p.gpuTemp === null));
});

test("SoC hotspot charts as its own series; invalid values and gaps are unavailable", () => {
  for (const bad of [0, -1, 151, NaN, Infinity, true, "44", null, undefined]) assert.equal(validSocTemperature(bad), null);
  const point = { t: 1000, cpu_pct: 0, ram_pct: 50, gpu_pct: null, cpu_temp_c: null, gpu_temp_c: null,
    smc_temperature: { tcmb_c: 58.4, tcmz_c: null } };
  const points = toChartHistory([point, {...point, t: 1200}, { ...point, t: 1260, smc_temperature: null }]);
  assert.equal(points[0].socTemp, 58.4);
  assert.equal(points[0].cpuTemp, null);
  assert.equal(points[1].socTemp, null);
  assert.equal(points[3].socTemp, null);
});


test("continuous pressure is independent of severity and RAM, preserving unknowns and gaps", () => {
  for (const [level, label, color] of [["normal", "正常", "#10b981"], ["warning", "警告", "#f59e0b"], ["critical", "嚴重", "#ef4444"]] as const) {
    assert.equal(memoryPressureDisplay(level).label, label);
    assert.equal(memoryPressureColor(level), color);
  }
  for (const invalid of [null, undefined, 0, 1, true, "50%", "green"]) {
    assert.equal(memoryPressureDisplay(invalid).label, "未知");
    assert.equal(memoryPressureColor(invalid), "#94a3b8");
  }
  for (const bad of [null, undefined, true, "37", -1, 101, 37.5, NaN, Infinity]) assert.equal(validMemoryPressure(bad), null);
  for (const good of [0, 37, 100]) assert.equal(validMemoryPressure(good), good);
  const base = { t: 1000, cpu_pct: 0, ram_pct: 99, gpu_pct: null, cpu_temp_c: null, gpu_temp_c: null };
  const points = toChartHistory([base, { ...base, t: 1060, memory_pressure: { level: "normal", pct: 37 } },
    { ...base, t: 1300, memory_pressure: { level: "critical", pct: 81 } },
    { ...base, t: 1360, memory_pressure: { level: null, pct: 0 } },
    { ...base, t: 1420, memory_pressure: { level: "normal" } }]);
  assert.deepEqual(points.map(p => p.pressure), [null, 37, null, 81, 0, null]);
  assert.equal(points[1].ram, 99);
  assert.equal(points[4].pressureColor, "#94a3b8");
});

test("whole-machine power charts on its own axis; invalid values and gaps are unavailable", () => {
  for (const bad of [0, -1, 501, NaN, Infinity, true, "3", null, undefined]) assert.equal(validSystemPower(bad), null);
  const point = { t: 1000, cpu_pct: 0, ram_pct: 50, gpu_pct: null, cpu_temp_c: null, gpu_temp_c: null, system_power_w: 3.24 };
  const points = toChartHistory([point, { ...point, t: 1200 }, { ...point, t: 1260, system_power_w: null }, { ...point, t: 1320, system_power_w: undefined }]);
  assert.deepEqual(points.map(p => p.power), [3.24, null, 3.24, null, null]);
  assert.equal(powerAxisMax([]), 10);
  assert.equal(powerAxisMax([{ power: 3.2 }, { power: null }]), 10);
  assert.equal(powerAxisMax([{ power: 12.1 }]), 15);
  assert.equal(powerAxisMax([{ power: 40 }]), 40);
});

test("watchdogs: named in Chinese, problems named in the summary, unknown when the computer is offline", () => {
  assert.equal(watchdogViews(undefined, true), null);
  assert.equal(watchdogViews(null, true), null);
  const raw = [
    { name: "funnel", healthy: true, last_action: "2026-10-26 04:12:05 turning the Funnel off and on" },
    { name: "ha-core", healthy: false, paused: true },
    { name: "ha-webhook-relay", healthy: false },
    { name: "something-new", healthy: true },
    { healthy: true },
  ];
  const views = watchdogViews(raw, true)!;
  assert.deepEqual(views.map(v => [v.label, v.state, v.lastAction]), [
    ["外網通道看門狗", "ok", "10/26 04:12"], ["HA 看門狗", "paused", null], ["SwitchBot 轉送", "down", null], ["something-new", "ok", null]]);
  assert.deepEqual(watchdogSummary(views), { state: "down", text: "背景服務：HA 看門狗已暫停、SwitchBot 轉送沒在跑" });
  assert.deepEqual(watchdogSummary(watchdogViews([raw[0], raw[3]], true)!), { state: "ok", text: "背景服務 2 個都正常" });
  assert.equal(watchdogSummary(watchdogViews(raw, false)!)!.state, "unknown");
  assert.ok(watchdogViews(raw, false)!.every(v => v.state === "unknown"));
  assert.equal(watchdogSummary([]), null);
});
