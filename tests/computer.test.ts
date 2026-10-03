import assert from "node:assert/strict";
import test from "node:test";
import { formatComputerMetric, toChartHistory } from "../src/lib/computer";

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
