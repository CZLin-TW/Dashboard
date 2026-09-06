import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TheaterSection } from "../src/components/devices/theater-section";
import type { TheaterSummary } from "../src/lib/theater";

const summary: TheaterSummary = {
  agent_id: "fake", flags: { kef_link: true, tv_screen_auto: false, tv_avr_sync: true },
};
function render(extra = {}, data = summary) {
  return renderToStaticMarkup(createElement(TheaterSection, {
    summary: data, offline: false, refreshing: false,
    onRefresh() {}, onFlagChange() {}, ...extra,
  }));
}
test("theater accepts older agents and locks every switch while saving, stale or offline", () => {
  assert.equal((render().match(/role="switch"/g) ?? []).length, 3);
  for (const state of [{ saving: true }, { stale: true }, { offline: true }]) {
    const markup = render(state);
    const switches = markup.match(/<button[^>]*role="switch"[^>]*>/g) ?? [];
    assert.equal(switches.length, 3);
    assert.ok(switches.every(button => button.includes("disabled")));
  }
});
test("theater distinguishes API availability, device staleness and picture recovery", () => {
  const markup = render({}, { ...summary,
    devices: { ls60: { power: "on", stale: true, error: "offline" } },
    health: { api: "ok", appletv: { sha: "abc1234", stale: false, restore_pending: "retry" } },
  });
  assert.ok(markup.includes("在線"));
  assert.ok(markup.includes("部分設備狀態尚未更新"));
  assert.ok(markup.includes("畫面恢復重試中"));
  assert.ok(markup.includes("abc1234"));
});
