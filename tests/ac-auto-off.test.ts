import assert from "node:assert/strict";
import test from "node:test";
import { createDemoState } from "../src/lib/demo/fixtures";
import { createSimulator } from "../src/lib/demo/simulator";
import { parseScheduleParams } from "../src/lib/schedule";

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
