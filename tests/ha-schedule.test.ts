import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState } from "../src/lib/demo/fixtures";
import { createSimulator } from "../src/lib/demo/simulator";
import { parseScheduleParams, toFormInitial } from "../src/lib/schedule";

test("HA AC schedule can be created, edited and deleted without controlling hardware now", async () => {
  const sim = createSimulator(createDemoState());
  const ac = sim.snapshot().devices.find(d => d.type === "空調" && d.controlProvider === "home_assistant")!;
  const before = {...ac};
  const request = (method: string, body: unknown) => sim.handle(new Request("http://demo/api/schedules", {method,body:JSON.stringify(body)}));
  const original = {device_name:ac.name,trigger_time:"2026-12-01 23:00"};
  assert.equal((await request("POST", {...original,target_action:"control_ac",params:{power:"on",temperature:28,mode:"冷氣",fan_speed:"自動"}})).status, 200);
  let row = sim.snapshot().schedules.find(s => s.觸發時間 === original.trigger_time)!;
  assert.equal(row.來源, "使用者（HA）");
  assert.equal(toFormInitial(row, ac).ac?.temperature, 28);
  assert.equal((await request("PATCH", {...original,params_new:{power:"off"},trigger_time_new:"2026-12-01 23:30"})).status, 200);
  row = sim.snapshot().schedules.find(s => s.觸發時間 === "2026-12-01 23:30")!;
  assert.equal(parseScheduleParams(row.參數).display, "關機");
  assert.deepEqual(sim.snapshot().devices.find(d => d.name === ac.name), before);
  assert.equal((await request("DELETE",{device_name:ac.name,trigger_time:"2026-12-01 23:30"})).status,200);
  assert.equal(sim.snapshot().schedules.some(s => s.觸發時間 === "2026-12-01 23:30"),false);
});
