import assert from "node:assert/strict";
import test from "node:test";
import { formatComputerMetric, toChartHistory, validSMCTemperature } from "../src/lib/computer";

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

test("SMC values stay independent, missing max stays null, invalid values and gaps are unavailable", () => {
  for (const bad of [0, -1, 151, NaN, Infinity, true, "44"]) assert.equal(validSMCTemperature(bad), null);
  const point = { t: 1000, cpu_pct: 0, ram_pct: 50, gpu_pct: null, cpu_temp_c: null, gpu_temp_c: null,
    smc_temperature: { tcmb_c: 44.5, tcmz_c: null } };
  const points = toChartHistory([point, {...point, t: 1200}]);
  assert.equal(points[0].tcmb, 44.5);
  assert.equal(points[0].tcmz, null);
  assert.equal(points[0].cpuTemp, null);
  assert.equal(points[1].tcmb, null);
  assert.equal(points[1].tcmz, null);
});
