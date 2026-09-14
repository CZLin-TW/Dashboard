"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { LightColorControl } from "@/components/light-color-control";
import type { LightColorState, LightStateCommand } from "@/lib/light-color";
import { Toggle2, Dropdown, Field, StatusLine, ControlDetails, PANEL_BASE } from "@/components/ui/device-controls";

interface LightingScene {
  id: string;
  name: string;
  resource_type?: string;
  recall_action?: string;
  dynamic_available?: boolean;
  group_id?: string;
  group_type?: string;
}

interface LightingEffect {
  key: string;
  label: string;
  supported_count: number;
  total_count: number;
  partial?: boolean;
}

interface LightingNotification {
  key: string;
  label: string;
  kind: string;
  action: string;
}

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
  light_count?: number;
  scenes?: LightingScene[];
  notifications?: LightingNotification[];
  effects?: LightingEffect[];
  color_control?: LightColorState;
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

function clampBrightness(n: number) {
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(100, Math.round(n)));
}

const ACTION_BUTTON = "inline-flex h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-cool px-3 text-[13px] font-medium text-white transition-colors hover:bg-cool/85 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-mute";

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
  const [selectedScenes, setSelectedScenes] = useState<Record<string, string>>({});
  const [selectedEffects, setSelectedEffects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [applyingKey, setApplyingKey] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  // A synchronous lock also catches blur + click in the same browser event turn.
  const commandInFlight = useRef(false);

  const loadAreas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/lighting/areas", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json() as LightingPayload;
      setPayload(data);
      const nextDrafts: Record<string, string> = {};
      for (const area of data.areas ?? []) {
        nextDrafts[area.id] = area.display_name || area.hue_name || area.id;
      }
      setDraftNames(nextDrafts);
      setDraftBri({});
      setSelectedScenes((prev) => {
        const nextScenes: Record<string, string> = {};
        for (const area of data.areas ?? []) {
          const scenes = Array.isArray(area.scenes) ? area.scenes : [];
          const current = prev[area.id];
          if (current && scenes.some((scene) => scene.id === current)) {
            nextScenes[area.id] = current;
          } else if (scenes[0]?.id) {
            nextScenes[area.id] = scenes[0].id;
          }
        }
        return nextScenes;
      });
      setSelectedEffects((prev) => {
        const nextEffects: Record<string, string> = {};
        for (const area of data.areas ?? []) {
          const effects = Array.isArray(area.effects) ? area.effects : [];
          const current = prev[area.id];
          if (current && effects.some((effect: LightingEffect) => effect.key === current)) {
            nextEffects[area.id] = current;
            continue;
          }
          const firstEffect = effects.find((effect: LightingEffect) => effect.key !== "no_effect") ?? effects[0];
          if (firstEffect?.key) nextEffects[area.id] = firstEffect.key;
        }
        return nextEffects;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void loadAreas();
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
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    setActionError("");
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
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
      commandInFlight.current = false;
    }
  }

  // Read confirmed state after each command; never display an optimistic ON as success.
  async function sendState(area: LightingArea, body: LightStateCommand) {
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    setApplyingKey(`state:${area.id}`);
    setNotice("");
    setActionError("");
    try {
      const res = await fetch(`/api/lighting/areas/${encodeURIComponent(area.id)}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      await loadAreas();
    } catch (e) {
      setActionError(`指令未確認：${e instanceof Error ? e.message : String(e)}。請確認狀態後再操作。`);
      await loadAreas();
    } finally {
      setApplyingKey("");
      commandInFlight.current = false;
    }
  }

  async function applyScene(area: LightingArea) {
    if (commandInFlight.current) return;
    const sceneId = selectedScenes[area.id];
    if (!sceneId) return;
    const scene = (area.scenes ?? []).find((item) => item.id === sceneId);
    commandInFlight.current = true;
    setActionError("");
    setApplyingKey(`scene:${area.id}`);
    setNotice("");
    try {
      const res = await fetch(`/api/lighting/scenes/${encodeURIComponent(sceneId)}/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: scene?.recall_action || (scene?.resource_type === "smart_scene" ? "activate" : "active"),
          resource_type: scene?.resource_type || "scene",
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const sceneName = scene?.name || "場景";
      setNotice(`${sceneName} 已套用`);
      await loadAreas();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingKey("");
      commandInFlight.current = false;
    }
  }

  async function applyEffect(area: LightingArea) {
    if (commandInFlight.current) return;
    const effectKey = selectedEffects[area.id];
    if (!effectKey) return;
    commandInFlight.current = true;
    setActionError("");
    setApplyingKey(`effect:${area.id}`);
    setNotice("");
    try {
      const res = await fetch(`/api/lighting/areas/${encodeURIComponent(area.id)}/effect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          effect: effectKey,
          resource_type: area.resource_type || "grouped_light",
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const effectName = (area.effects ?? []).find((effect) => effect.key === effectKey)?.label || "效果";
      setNotice(`${effectName} 已套用`);
      await loadAreas();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingKey("");
      commandInFlight.current = false;
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

  const busy = loading || !!applyingKey || !!savingId;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
            <Lightbulb className="h-4 w-4" strokeWidth={2} />照明控制
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-xs text-mute">
            {payload.agent_id && !error ? <Wifi className="h-3.5 w-3.5 text-fresh" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{error ? "連線未確認" : payload.agent_id === "home_assistant" ? "Home Assistant" : payload.agent_id ? "家庭照明" : "等待照明連線"}</span>
            <span>· {areas.length} 個區域</span>
          </p>
        </div>
        <button type="button" onClick={loadAreas} disabled={busy}
          className="inline-flex h-[38px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-soft hover:bg-elevated disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />重新整理
        </button>
      </header>

      {(error || actionError) && <div role="alert" className="rounded-[14px] border border-warm/25 bg-warm-bg px-3.5 py-3 text-sm text-warm">{error || actionError}</div>}
      {notice && !error && !actionError && <div role="status" className="rounded-[14px] border border-fresh/20 bg-fresh-bg px-3.5 py-3 text-sm text-fresh">{notice}</div>}

      {loading && areas.length === 0 ? (
        <div className={PANEL_BASE}><p className="flex items-center gap-2 text-sm text-mute"><Loader2 className="h-4 w-4 animate-spin" />載入中</p></div>
      ) : areas.length === 0 ? (
        <div className={PANEL_BASE}><p className="text-sm text-mute">{error ? "無法讀取照明，請重新整理。" : "目前沒有可用區域"}</p></div>
      ) : (
        <section aria-label="照明區域" className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const Icon = areaIcon(area.kind);
            const name = area.display_name || area.hue_name || area.id;
            const draft = draftNames[area.id] ?? name;
            const bri = brightnessValue(area);
            const scenes = area.scenes ?? [];
            const effects = area.effects ?? [];
            const known = typeof area.on === "boolean" && !error;
            const disabled = busy || !known;
            return (
              <article key={area.id} aria-label={name} className={`${PANEL_BASE} min-w-0`}>
                <div className="flex items-center gap-2">
                  <Icon className="h-[18px] w-[18px] shrink-0 text-mute" strokeWidth={1.8} />
                  <h2 className="min-w-0 truncate text-base font-semibold">{name}</h2>
                  <span className="ml-auto shrink-0 text-xs text-mute">{area.light_count ?? "—"} 盞燈</span>
                </div>
                <StatusLine tone={!known ? "waiting" : area.on ? "running" : "off"}
                  text={!known ? "狀態未知" : `${area.on ? "已開啟" : "關閉"}${area.on && typeof area.brightness === "number" ? ` · 亮度 ${Math.round(area.brightness)}%` : ""}`} />
                <div className="flex items-end justify-between gap-4">
                  <Field label="電源"><Toggle2 value={area.on === true} onChange={(on) => { void sendState(area, { on }); }} disabled={disabled} /></Field>
                  <Field label="亮度">
                    <div className="flex h-[38px] items-center gap-1">
                      <input type="number" min={1} max={100} inputMode="numeric" value={bri} disabled={disabled}
                        aria-label={`${name}亮度數值`}
                        onChange={(e) => setDraftBri(prev => ({ ...prev, [area.id]: Number(e.target.value) }))}
                        onBlur={() => commitBrightness(area)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        className="num h-[38px] w-16 rounded-full border border-line/70 bg-elevated px-2 text-center text-base font-medium text-soft disabled:opacity-50" />
                      <span className="text-xs text-mute">%</span>
                    </div>
                  </Field>
                </div>
                <input type="range" min={1} max={100} step={1} value={bri} disabled={disabled}
                  aria-label={`${name}亮度`}
                  onChange={(e) => setDraftBri(prev => ({ ...prev, [area.id]: Number(e.target.value) }))}
                  onPointerUp={() => commitBrightness(area)}
                  onKeyUp={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) commitBrightness(area); }}
                  className="h-5 w-full min-w-0 cursor-pointer accent-cool disabled:opacity-40" />
                {area.color_control && <LightColorControl name={name} value={area.color_control}
                  total={area.light_count ?? 0} disabled={disabled} onSend={body => sendState(area, body)} />}
                  <Field label="特效">
                    <div className="flex min-w-0 items-center gap-2">
                      <Dropdown ariaLabel={`${name}效果`} options={effects.map(effect => ({ value: effect.key, label: `${effect.label}${effect.partial ? " · 部分燈具" : ""}` }))}
                        value={selectedEffects[area.id]} onSelect={value => setSelectedEffects(prev => ({ ...prev, [area.id]: value }))}
                        disabled={disabled || !effects.length} placeholder="無效果" className="min-w-0 flex-1" />
                      <button type="button" className={ACTION_BUTTON} disabled={disabled || !selectedEffects[area.id]} onClick={() => applyEffect(area)}>套用</button>
                    </div>
                  </Field>
                <Field label="場景">
                  <div className="flex min-w-0 items-center gap-2">
                    <Dropdown ariaLabel={`${name}場景`} options={scenes.map(scene => ({ value: scene.id, label: `${scene.name || scene.id}${scene.resource_type === "smart_scene" ? " · 全天" : ""}` }))}
                      value={selectedScenes[area.id]} onSelect={(value) => setSelectedScenes(prev => ({ ...prev, [area.id]: value }))}
                      disabled={disabled || !scenes.length} placeholder="無場景" className="min-w-0 flex-1" />
                    <button type="button" className={ACTION_BUTTON} disabled={disabled || !selectedScenes[area.id]} onClick={() => applyScene(area)}>
                      {applyingKey === `scene:${area.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}套用
                    </button>
                  </div>
                </Field>
                <ControlDetails title="區域設定" summary="名稱">
                  <Field label="顯示名稱">
                    <div className="flex min-w-0 items-center gap-2">
                      <input value={draft} aria-label={`${name}顯示名稱`} disabled={busy}
                        onChange={e => setDraftNames(prev => ({ ...prev, [area.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter" && draft.trim() !== name.trim()) void saveName(area); }}
                        className="h-[38px] min-w-0 flex-1 rounded-full border border-line/70 bg-elevated px-3 text-base text-soft" />
                      <button type="button" className={ACTION_BUTTON} disabled={busy || draft.trim() === name.trim()} onClick={() => saveName(area)}>
                        {savingId === area.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}儲存
                      </button>
                    </div>
                  </Field>
                  <p className="text-xs text-mute">Hue 名稱：{area.hue_name || "未命名"}</p>
                </ControlDetails>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
