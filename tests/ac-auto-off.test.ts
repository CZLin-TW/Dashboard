import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState } from "../src/lib/demo/fixtures";
import { createSimulator } from "../src/lib/demo/simulator";
import { parseScheduleParams } from "../src/lib/schedule";

test("auto-off saves integer hours, preserves same-setting deadline and disables without controlling AC", async () => {
  const sim = createSimulator(createDemoState());
  const before = sim.snapshot().devices;
  const name = before.find(d => d.controlProvider === "home_assistant")!.name;
  const set = (hours: unknown) => sim.handle(new Request("http://demo/api/ac/auto-off", { method: "POST", body: JSON.stringify({device_name:name, hours}) }));
  const saved = await (await set(3)).json();
  assert.equal(saved.status,"counting");
  assert.ok(saved.scheduled_at);
  assert.deepEqual(await (await set(3)).json(), saved);
  assert.equal((await set(1.5)).status,422);
  assert.equal((await (await set(0)).json()).status,"disabled");
  assert.deepEqual(sim.snapshot().devices,before);
});

test("offline HA can save or disable auto-off settings without pretending to start a timer", async () => {
  const sim = createSimulator(createDemoState("offline"));
  const name = sim.snapshot().devices.find(d => d.controlProvider === "home_assistant")!.name;
  const res = await sim.handle(new Request("http://demo/api/ac/auto-off", {method:"POST",body:JSON.stringify({device_name:name,hours:3})}));
  assert.deepEqual(await res.json(),{hours:3,status:"unavailable",scheduled_at:null});
});

test("active timer records cannot be deleted; closed attention records can be removed", async () => {
  const state = createDemoState();
  const name = state.devices.find(d => d.controlProvider === "home_assistant")!.name;
  const record = {設備名稱:name, 動作:"control_ac", 參數:JSON.stringify({power:"off",_auto_hours:3}), 狀態:"待確認", 來源:"自動（HA）",觸發時間:"2026-12-01 03:00",執行識別碼:"auto-test"};
  state.schedules.push(record);
  const remove = (sim: ReturnType<typeof createSimulator>) => sim.handle(new Request("http://demo/api/schedules",{method:"DELETE",body:JSON.stringify({device_name:name,trigger_time:record.觸發時間,execution_id:record.執行識別碼})}));
  assert.equal((await remove(createSimulator(state))).status,400);
  record.參數 = JSON.stringify({power:"off",_auto_hours:3,_auto_closed:true});
  assert.equal(parseScheduleParams(record.參數).autoClosed,true);
  assert.equal((await remove(createSimulator(state))).status,200);
});
