"use client";

import { useEffect, useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { createDemoState, type DemoState, type Scenario } from "@/lib/demo/fixtures";
import { createSimulator, demoFetch } from "@/lib/demo/simulator";

const STATE_KEY = "dashboard-demo:v1";
const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "normal", label: "正常資料" }, { value: "empty", label: "空資料" },
  { value: "offline", label: "設備離線" }, { value: "error", label: "API 失敗" },
];

function save(state: DemoState) { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); }
function clearCaches() {
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("cache:")) sessionStorage.removeItem(key);
}
function seedPins(state: DemoState) {
  sessionStorage.setItem("pinned-devices", JSON.stringify(state.devices.filter(d => d.type !== "感應器").map(d => d.name).slice(0, 4)));
  sessionStorage.setItem("pinned-sensor", state.devices.find(d => d.type === "感應器")?.name ?? "");
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [failure, setFailure] = useState("");
  useEffect(() => {
    // Mount children only after interception is installed: their initial fetches must not race it.
    const original = window.fetch;
    try {
      let state = createDemoState();
      const saved = sessionStorage.getItem(STATE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as DemoState;
          if (parsed.schema === 1 && Array.isArray(parsed.devices) && SCENARIOS.some(s => s.value === parsed.scenario)) state = parsed;
        } catch { /* corrupted demo data: restore synthetic defaults */ }
      }
      if (!saved) seedPins(state);
      save(state);
      clearCaches();
      window.fetch = demoFetch(createSimulator(state, save), window.location.origin, original);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gate children until browser-only mock installation completes
      setScenario(state.scenario);
      setReady(true);
    } catch {
      setFailure("無法儲存測試資料。請允許此網站使用瀏覽器儲存空間後重新整理。");
    }
    return () => { window.fetch = original; };
  }, []);

  function reset(next: Scenario) {
    const state = createDemoState(next);
    save(state); seedPins(state); clearCaches();
    window.location.reload();
  }

  return <>
    <aside aria-label="測試模式" className="border-b border-amber/25 bg-amber-bg px-4 py-3 text-sm text-soft">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <div><strong>測試模式 · 模擬家庭</strong><p className="mt-0.5 text-xs text-mute">操作只影響此分頁的模擬資料。排程、推播與家電動作皆為模擬。</p></div>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="demo-scenario">測試情境（切換會重設資料）</label>
          <select id="demo-scenario" value={scenario} disabled={!ready} onChange={e => reset(e.target.value as Scenario)} className="field-select rounded-full border border-amber/25 bg-surface py-1.5 pl-3 text-xs">
            {SCENARIOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button type="button" disabled={!ready} onClick={() => reset(scenario)} className="flex items-center gap-1 rounded-full border border-amber/25 bg-surface px-3 py-1.5 text-xs"><RotateCcw className="h-3 w-3" />重設資料</button>
        </div>
      </div>
    </aside>
    {ready ? children : <p role="status" className="p-8 text-center text-mute">{failure || "正在準備模擬家庭…"}</p>}
  </>;
}
