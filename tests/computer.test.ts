import assert from "node:assert/strict";
import test from "node:test";
import { formatComputerMetric, toChartHistory, validSocTemperature, memoryPressureDisplay, validMemoryPressure, memoryPressureColor } from "../src/lib/computer";

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
