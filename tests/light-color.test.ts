import assert from "node:assert/strict";
import test from "node:test";
import { wheelColor, wheelPosition, colorPreview } from "../src/lib/light-color";
import { createSimulator } from "../src/lib/demo/simulator";
import { createDemoState } from "../src/lib/demo/fixtures";

test("wheel coordinates match the visible hue gradient and clamp captured pointer", () => {
  assert.deepEqual(wheelColor(0, -1), [0, 100]);
  assert.deepEqual(wheelColor(1, 0), [90, 100]);
  assert.deepEqual(wheelColor(0, 1), [180, 100]);
  assert.equal(wheelColor(0, 0)[1], 0);
  assert.deepEqual(wheelColor(0, -4), [0, 100]);
  assert.deepEqual(wheelPosition([0, 50]), { left: "50%", top: "25%" });
  assert.equal(colorPreview([0, 0]), "hsl(0 100% 100%)");
});

test("colour settings preserve off state, validate before mutations and scenes replace colour", async () => {
  const sim = createSimulator(createDemoState());
  const send = (id: string, body: unknown) => sim.handle(new Request(`http://demo/api/lighting/areas/${id}/state`, {
    method: "PATCH", body: JSON.stringify(body),
  }));
  await send("demo-living", { on: false });
  assert.equal((await send("demo-living", { hs_color: [300, 40] })).status, 200);
  assert.equal(sim.snapshot().areas[0].on, false);
  assert.deepEqual(sim.snapshot().areas[0].color_control?.hs, [300, 40]);
  assert.equal((await send("demo-living", { on: true, hs_color: [400, 40] })).status, 422);
  assert.equal(sim.snapshot().areas[0].on, false);
  assert.equal((await send("demo-bedroom", { hs_color: [30, 40] })).status, 422);
  assert.equal((await send("demo-living", { hs_color: [30, 40], color_temp_kelvin: 3000 })).status, 422);
  assert.equal((await send("demo-living", { color_temp_kelvin: 7000 })).status, 422);
  await send("demo-living", { color_temp_kelvin: 4000 });
  assert.equal(sim.snapshot().areas[0].color_control?.mode, "temperature");
  assert.equal(sim.snapshot().areas[0].color_control?.kelvin, 4000);
  await send("demo-living", { hs_color: [240, 90] });
  await sim.handle(new Request("http://demo/api/lighting/scenes/demo-scene-0-night/recall", { method: "POST", body: "{}" }));
  assert.equal(sim.snapshot().areas[0].color_control?.mode, "temperature");
  assert.equal(sim.snapshot().areas[0].color_control?.hs, null);
});
