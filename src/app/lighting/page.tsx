"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Home,
  Lightbulb,
  Loader2,
  MapPinned,
  RefreshCw,
  Save,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Toggle2, FIELD_LABEL, PANEL_BASE } from "@/components/ui/device-controls";

interface LightingArea {
  id: string;
  resource_type: string;
  hue_resource_id: string;
  hue_resource_type: string;
  hue_name: string;
  grouped_light_name?: string;
  kind: string;
  owner_type?: string;
  owner_id?: string;
  display_name: string;
  custom_name?: string;
  enabled?: boolean;
  on?: boolean | null;
  brightness?: number | null;
}

interface LightingPayload {
  agent_id: string;
  areas: LightingArea[];
  counts?: Record<string, number>;
}

const FALLBACK_PAYLOAD: LightingPayload = { agent_id: "", areas: [] };

function areaIcon(kind: string) {
  if (kind === "房間") return Home;
  if (kind === "區域") return MapPinned;
  return Lightbulb;
}

function shortId(id: string) {
  if (!id) return "";
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function clampBrightness(n: number) {
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(100, Math.round(n)));
}

async function readError(res: Response) {
  try {
    const data = await res.json();
    return data?.error || data?.detail || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export default function LightingPage() {
  const [payload, setPayload] = useState<LightingPayload>(FALLBACK_PAYLOAD);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftBri, setDraftBri] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");

  const loadAreas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/lighting/areas", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setPayload(data);
      const nextDrafts: Record<string, string> = {};
      for (const area of data.areas ?? []) {
        nextDrafts[area.id] = area.display_name || area.hue_name || area.id;
      }
      setDraftNames(nextDrafts);
      setDraftBri({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount 載入一次（loadAreas 內部 setLoading），沿用 use-cached-fetch 等既有慣例
    loadAreas();
  }, [loadAreas]);

  const areas = useMemo(
    () =>
      [...(payload.areas ?? [])].filter((area) => {
        // 只列房間 / 區域；藏掉「全家」(bridge_home) 與沒掛 room/zone 的獨立燈群 (grouped_light)
        const source = area.hue_resource_type || area.owner_type || "";
        return area.enabled !== false && (source === "room" || source === "zone");
      }),
    [payload.areas],
  );

  async function saveName(area: LightingArea) {
    setSavingId(area.id);
    setNotice("");
    try {
      const displayName = (draftNames[area.id] ?? "").trim();
      const res = await fetch(`/api/lighting/areas/${encodeURIComponent(area.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          resource_type: area.resource_type || "grouped_light",
          hue_name: area.hue_name || "",
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setPayload((prev) => ({
        ...prev,
        areas: prev.areas.map((item) => (
          item.id === area.id
            ? { ...item, display_name: displayName || item.hue_name || item.id, custom_name: displayName }
            : item
        )),
      }));
      setNotice("名稱已儲存");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  }

  // On/Off 與亮度共用：樂觀更新後送 PATCH，失敗才重抓真實狀態對齊。
  async function sendState(area: LightingArea, body: { on?: boolean; brightness?: number }) {
    setNotice("");
    setPayload((prev) => ({
      ...prev,
      areas: prev.areas.map((item) => {
        if (item.id !== area.id) return item;
        const next = { ...item };
        if (body.on !== undefined) next.on = body.on;
        if (body.brightness !== undefined) {
          next.brightness = body.brightness;
          next.on = true; // 調亮度視為順便開燈
        }
        return next;
      }),
    }));
    try {
      const res = await fetch(`/api/lighting/areas/${encodeURIComponent(area.id)}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
      loadAreas();
    }
  }

  function brightnessValue(area: LightingArea) {
    const draft = draftBri[area.id];
    if (draft !== undefined) return draft;
    if (typeof area.brightness === "number") return Math.round(area.brightness);
    return 100;
  }

  function commitBrightness(area: LightingArea) {
    const draft = draftBri[area.id];
    if (draft === undefined) return; // 沒拖/沒打就不送
    const value = clampBrightness(draft);
    setDraftBri((prev) => {
      const next = { ...prev };
      delete next[area.id];
      return next;
    });
    const current = typeof area.brightness === "number" ? Math.round(area.brightness) : null;
    if (current !== null && value === current && area.on) return; // 沒變化、且已亮著就免送
    sendState(area, { brightness: value });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-[22px] font-bold">
            <Lightbulb className="h-5 w-5 text-mute" strokeWidth={2} />
            照明
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1">
              {payload.agent_id ? (
                <Wifi className="h-3.5 w-3.5 text-fresh" strokeWidth={2} />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-mute" strokeWidth={2} />
              )}
              {payload.agent_id || "等待 agent"}
            </span>
            <span className="rounded-full border border-line bg-surface px-2.5 py-1">
              {areas.length} 個區域
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={loadAreas}
          disabled={loading}
          title="重新整理"
          aria-label="重新整理"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-soft transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <RefreshCw className="h-4 w-4" strokeWidth={2} />
          )}
          重新整理
        </button>
      </header>

      {(error || notice) && (
        <div className={`rounded-[14px] border px-3.5 py-3 text-sm ${
          error
            ? "border-warm/25 bg-warm-bg text-warm"
            : "border-fresh/20 bg-fresh/10 text-fresh"
        }`}>
          {error || notice}
        </div>
      )}

      {loading && areas.length === 0 ? (
        <div className={PANEL_BASE}>
          <div className="flex items-center gap-2 text-sm text-mute">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            載入中
          </div>
        </div>
      ) : areas.length === 0 ? (
        <div className={PANEL_BASE}>
          <p className="text-sm text-mute">目前沒有可用區域</p>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const Icon = areaIcon(area.kind);
            const draft = draftNames[area.id] ?? area.display_name ?? area.hue_name ?? "";
            const saving = savingId === area.id;
            const nameDirty = draft.trim() !== (area.display_name ?? "").trim();
            const bri = brightnessValue(area);
            const isOn = area.on ?? false;
            return (
              <article key={area.id} className={PANEL_BASE}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-elevated text-mute">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[18px] font-bold text-foreground">
                        {area.display_name || area.hue_name || area.id}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-mute">
                        <span>{area.kind || "Hue"}</span>
                        <span>·</span>
                        <span className="num">{shortId(area.id)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className={FIELD_LABEL}>顯示名稱</span>
                  <div className="flex items-center gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraftNames((prev) => ({ ...prev, [area.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && nameDirty) saveName(area); }}
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-elevated px-3 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-mute focus:border-cool"
                      placeholder={area.hue_name || "未命名區域"}
                    />
                    <button
                      type="button"
                      onClick={() => saveName(area)}
                      disabled={saving || !nameDirty}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cool px-3.5 text-sm font-semibold text-white transition-colors hover:bg-cool/85 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-mute"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <Save className="h-4 w-4" strokeWidth={2} />}
                      儲存
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-[10px] bg-elevated px-3 py-2 text-xs text-mute">
                  <div className="flex items-center justify-between gap-2">
                    <span>Hue 名稱</span>
                    <span className="truncate text-soft">{area.hue_name || "未命名"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>來源</span>
                    <span className="truncate text-soft">{area.owner_type || area.hue_resource_type || "-"}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className={FIELD_LABEL}>亮度</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={100}
                      step={1}
                      value={bri}
                      onChange={(e) => setDraftBri((prev) => ({ ...prev, [area.id]: Number(e.target.value) }))}
                      onPointerUp={() => commitBrightness(area)}
                      onKeyUp={() => commitBrightness(area)}
                      className="h-9 flex-1 cursor-pointer accent-fresh"
                      aria-label="亮度"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={bri}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setDraftBri((prev) => ({ ...prev, [area.id]: 0 }));
                            return;
                          }
                          const n = Number(raw);
                          if (!Number.isNaN(n)) setDraftBri((prev) => ({ ...prev, [area.id]: n }));
                        }}
                        onBlur={() => commitBrightness(area)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="num h-8 w-14 rounded-[10px] border border-line bg-elevated px-2 text-center text-sm text-foreground outline-none transition-colors focus:border-cool"
                        aria-label="亮度數值"
                      />
                      <span className="text-xs text-mute">%</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={FIELD_LABEL}>電源</span>
                  <Toggle2 value={isOn} onChange={(v) => sendState(area, { on: v })} />
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
