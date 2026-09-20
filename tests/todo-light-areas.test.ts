import assert from "node:assert/strict";
import test from "node:test";
import { createSimulator } from "../src/lib/demo/simulator";
import { todoLightAreaIds } from "../src/lib/todo-light-areas";

const request = (path: string, method = "GET", body?: object) => new Request(`http://demo/api/${path}`, {
  method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
});

test("multiple reminder targets survive readback, unrelated edits, removal and disable", async () => {
  const sim = createSimulator();
  assert.deepEqual(todoLightAreaIds({ 燈光區域ID: "living" }), ["living"]);
  assert.deepEqual(todoLightAreaIds({}, "living"), ["living"]);
  assert.deepEqual(todoLightAreaIds({ 燈光區域ID: "[bad" }, "living"), []);
  const targets = ["demo-living", "demo-bedroom"];
  const add = await sim.handle(request("todos", "POST", { item: "複選測試", date: "2026-09-20", time: "19:00", light_notify: true, light_area_ids: [...targets, "demo-living"] }));
  assert.equal(add.status, 200);
  const todos = await (await sim.handle(request("todos"))).json();
  const created = todos.find((t: { 事項: string }) => t.事項 === "複選測試");
  assert.deepEqual(todoLightAreaIds(created), targets);
  const read = async () => (await (await sim.handle(request("todos"))).json()).find((t: { 待辦ID: string }) => t.待辦ID === created.待辦ID);
  await sim.handle(request("todos", "PATCH", { todo_id: created.待辦ID, item_new: "已改名" }));
  assert.deepEqual(todoLightAreaIds(await read()), targets);
  assert.equal((await sim.handle(request("todos", "PATCH", { todo_id: created.待辦ID, light_area_ids: [] }))).status, 400);
  assert.deepEqual(todoLightAreaIds(await read()), targets);
  await sim.handle(request("todos", "PATCH", { todo_id: created.待辦ID, light_area_ids: ["demo-bedroom"] }));
  assert.equal((await read()).燈光區域ID, "demo-bedroom");
  await sim.handle(request("todos", "PATCH", { todo_id: created.待辦ID, light_notify: false }));
  assert.equal((await read()).燈光提醒, false);
  assert.equal((await read()).燈光區域ID, "");
});

test("recurring templates save all selected areas and reject unknown targets", async () => {
  const sim = createSimulator();
  const body = { item: "週期複選", recur_type: "每天", time: "20:00", light_notify: true, light_area_ids: ["demo-living", "demo-bedroom"] };
  assert.equal((await sim.handle(request("recurring-todos", "POST", { ...body, light_area_ids: ["missing"] }))).status, 400);
  assert.equal((await sim.handle(request("recurring-todos", "POST", body))).status, 200);
  const rules = await (await sim.handle(request("recurring-todos"))).json();
  const created = rules.find((r: { 事項: string }) => r.事項 === body.item);
  assert.equal(created.燈光提醒, true);
  assert.deepEqual(todoLightAreaIds(created), body.light_area_ids);
});
