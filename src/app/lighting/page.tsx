"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Home,
  Lightbulb,
  Loader2,
  MapPinned,
  Moon,
  RefreshCw,
  Save,
  Sun,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Toggle2, FIELD_LABEL, PANEL_BASE } from "@/components/ui/device-controls";

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
}

interface LightingPayload {
  agent_id: string;
  areas: LightingArea[];
  counts?: Record<string, number>;
}

interface AutoRuleRuntime {
  window_active?: boolean;
  last_light_level?: number | null;
  last_light_at?: number;
}

interface AutoRule {
  area_name?: string;
  enabled: boolean;
  sensor_device_id: string;
  sensor_name?: string;
  threshold: number;
  scene_id: string;
  scene_name?: string;
  scene_type?: string;
  scene_action?: string;
  brightness: number;
  start_time: string;
  end_time: string;
  last_event?: string;
  last_event_at?: string;
  runtime?: AutoRuleRuntime;
}

interface AutoSensor {
  name: string;
  location?: string;
  device_id: string;
}

// 偵測按鈕回傳：webhook 快取（有資料年齡）或 status 雲端快取（樣本時間未知）
interface ProbeResult {
  light_level: number | null;
  source?: string;
  age_seconds?: number | null;
}

const AUTO_EVENT_LABEL: Record<string, string> = {
  triggered_on: "已自動開燈",
  triggered_off: "已自動關燈",
  window_end_off: "時段結束關燈",
};

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

function clampInt(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function formatAge(seconds: number) {
  if (seconds < 90) return "剛剛";
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分前`;
  return `${Math.floor(seconds / 3600)} 小時前`;
}

function defaultAutoRule(area: LightingArea, sensors: AutoSensor[]): AutoRule {
  return {
    enabled: false,
    sensor_device_id: sensors[0]?.device_id ?? "",
    threshold: 5,
    scene_id: area.scenes?.[0]?.id ?? "",
    brightness: 30,
    start_time: "18:00",
    end_time: "06:00",
  };
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
  const [selectedScenes, setSelectedScenes] = useState<Record<string, string>>({});
  const [selectedNotifications, setSelectedNotifications] = useState<Record<string, string>>({});
  const [selectedEffects, setSelectedEffects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [applyingKey, setApplyingKey] = useState("");
  const [notice, setNotice] = useState("");
  const [autoRules, setAutoRules] = useState<Record<string, AutoRule>>({});
  const [autoSensors, setAutoSensors] = useState<AutoSensor[]>([]);
  const [autoDrafts, setAutoDrafts] = useState<Record<string, AutoRule>>({});
  const [autoSavingId, setAutoSavingId] = useState("");
  const [probingId, setProbingId] = useState("");
  const [probeLevels, setProbeLevels] = useState<Record<string, ProbeResult>>({});
  // 規則載入當下的時間戳（epoch 秒）：render 內算 runtime 亮度值的資料年齡用
  // （render 不能直接呼叫 Date.now()，react-hooks/purity）
  const [rulesLoadedAt, setRulesLoadedAt] = useState(0);

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
      setSelectedNotifications((prev) => {
        const nextNotifications: Record<string, string> = {};
        for (const area of data.areas ?? []) {
          const notifications = Array.isArray(area.notifications) ? area.notifications : [];
          const current = prev[area.id];
          if (current && notifications.some((notification: LightingNotification) => notification.key === current)) {
            nextNotifications[area.id] = current;
          } else if (notifications[0]?.key) {
            nextNotifications[area.id] = notifications[0].key;
          }
        }
        return nextNotifications;
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

  // 自動夜燈設定（規則 + 感應器清單）。失敗不擋整頁，只是區塊顯示空清單。
  const loadAutoConfig = useCallback(async () => {
    try {
      const [rulesRes, sensorsRes] = await Promise.all([
        fetch("/api/lighting/auto/rules", { cache: "no-store" }),
        fetch("/api/lighting/auto/sensors", { cache: "no-store" }),
      ]);
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setAutoRules((data?.rules && typeof data.rules === "object") ? data.rules : {});
        setRulesLoadedAt(Date.now() / 1000);
      }
      if (sensorsRes.ok) {
        const data = await sensorsRes.json();
        setAutoSensors(Array.isArray(data?.sensors) ? data.sensors : []);
      }
    } catch {
      // 靜默：自動夜燈設定載入失敗不影響照明手動控制
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount 載入一次（loadAreas 內部 setLoading），沿用 use-cached-fetch 等既有慣例
    loadAreas();
    loadAutoConfig();
  }, [loadAreas, loadAutoConfig]);

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

  async function applyScene(area: LightingArea) {
    const sceneId = selectedScenes[area.id];
    if (!sceneId) return;
    const scene = (area.scenes ?? []).find((item) => item.id === sceneId);
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
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingKey("");
    }
  }

  async function applyEffect(area: LightingArea) {
    const effectKey = selectedEffects[area.id];
    if (!effectKey) return;
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
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingKey("");
    }
  }

  async function applyNotification(area: LightingArea) {
    const notificationKey = selectedNotifications[area.id];
    if (!notificationKey) return;
    setApplyingKey(`notification:${area.id}`);
    setNotice("");
    try {
      const res = await fetch(`/api/lighting/areas/${encodeURIComponent(area.id)}/notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification: notificationKey,
          resource_type: area.resource_type || "grouped_light",
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const notificationName = (area.notifications ?? []).find((item) => item.key === notificationKey)?.label || "通知";
      setNotice(`${notificationName} 已套用`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingKey("");
    }
  }

  // ── 自動夜燈 ──

  function autoRuleOf(area: LightingArea): AutoRule {
    return autoDrafts[area.id] ?? autoRules[area.id] ?? defaultAutoRule(area, autoSensors);
  }

  function updateAutoDraft(area: LightingArea, patch: Partial<AutoRule>) {
    setAutoDrafts((prev) => ({
      ...prev,
      [area.id]: { ...(prev[area.id] ?? autoRules[area.id] ?? defaultAutoRule(area, autoSensors)), ...patch },
    }));
  }

  async function saveAutoRule(area: LightingArea) {
    const draft = autoRuleOf(area);
    if (draft.enabled && (!draft.sensor_device_id || !draft.scene_id)) {
      setNotice("啟用自動夜燈需選擇光感應器與場景");
      return;
    }
    const scene = (area.scenes ?? []).find((s) => s.id === draft.scene_id);
    const sensor = autoSensors.find((s) => s.device_id === draft.sensor_device_id);
    setAutoSavingId(area.id);
    setNotice("");
    try {
      const res = await fetch(`/api/lighting/auto/rules/${encodeURIComponent(area.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: draft.enabled,
          sensor_device_id: draft.sensor_device_id,
          sensor_name: sensor?.name ?? draft.sensor_name ?? "",
          threshold: clampInt(draft.threshold, 1, 20),
          scene_id: draft.scene_id,
          scene_name: scene?.name ?? draft.scene_name ?? "",
          scene_type: scene?.resource_type ?? draft.scene_type ?? "scene",
          scene_action: scene?.recall_action
            ?? (scene?.resource_type === "smart_scene" ? "activate" : "active"),
          brightness: clampBrightness(draft.brightness),
          start_time: draft.start_time,
          end_time: draft.end_time,
          area_name: area.display_name || area.hue_name || area.id,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      if (data?.rule) setAutoRules((prev) => ({ ...prev, [area.id]: data.rule }));
      setAutoDrafts((prev) => {
        const next = { ...prev };
        delete next[area.id];
        return next;
      });
      setNotice("自動夜燈設定已儲存");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoSavingId("");
    }
  }

  // 實測選定感應器當下的 lightLevel（1~20），給調門檻時參考
  async function probeLightLevel(area: LightingArea) {
    const deviceId = autoRuleOf(area).sensor_device_id;
    if (!deviceId || probingId) return;
    setProbingId(area.id);
    setNotice("");
    try {
      const res = await fetch(
        `/api/lighting/auto/sensors/${encodeURIComponent(deviceId)}/light-level`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setProbeLevels((prev) => ({
        ...prev,
        [deviceId]: {
          light_level: typeof data?.light_level === "number" ? data.light_level : null,
          source: typeof data?.source === "string" ? data.source : undefined,
          age_seconds: typeof data?.age_seconds === "number" ? data.age_seconds : null,
        },
      }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setProbingId("");
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
            const scenes = area.scenes ?? [];
            const notifications = area.notifications ?? [];
            const effects = area.effects ?? [];
            const sceneApplying = applyingKey === `scene:${area.id}`;
            const notificationApplying = applyingKey === `notification:${area.id}`;
            const effectApplying = applyingKey === `effect:${area.id}`;
            const auto = autoRuleOf(area);
            const savedAuto = autoRules[area.id];
            const autoDirty = autoDrafts[area.id] !== undefined;
            const autoSaving = autoSavingId === area.id;
            const autoProbing = probingId === area.id;
            const probed = probeLevels[auto.sensor_device_id];
            const runtimeLevel = savedAuto?.runtime?.last_light_level;
            const runtimeAt = savedAuto?.runtime?.last_light_at ?? 0;
            // 按過偵測 → 顯示偵測結果（webhook 來源附年齡、status 標雲端值）；
            // 沒按過但規則 runtime 有 webhook/tick 留下的值 → 直接顯示＋年齡
            let probeLabel = "偵測亮度";
            if (probed) {
              if (probed.light_level === null) {
                probeLabel = "無亮度數值";
              } else if (probed.source === "webhook" && typeof probed.age_seconds === "number") {
                probeLabel = `目前 ${probed.light_level}・${formatAge(probed.age_seconds)}`;
              } else {
                probeLabel = `目前 ${probed.light_level}・雲端值`;
              }
            } else if (typeof runtimeLevel === "number" && runtimeAt > 0 && rulesLoadedAt > 0) {
              probeLabel = `目前 ${runtimeLevel}・${formatAge(Math.max(0, rulesLoadedAt - runtimeAt))}`;
            }
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
                  <span className={FIELD_LABEL}>場景</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedScenes[area.id] ?? ""}
                      onChange={(e) => setSelectedScenes((prev) => ({ ...prev, [area.id]: e.target.value }))}
                      disabled={scenes.length === 0 || sceneApplying}
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-elevated px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-cool disabled:cursor-not-allowed disabled:text-mute"
                      aria-label="場景"
                    >
                      {scenes.length === 0 ? (
                        <option value="">無場景</option>
                      ) : scenes.map((scene) => (
                        <option key={scene.id} value={scene.id}>
                          {scene.name || scene.id}{scene.resource_type === "smart_scene" ? " · 全天" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => applyScene(area)}
                      disabled={scenes.length === 0 || sceneApplying}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cool px-3.5 text-sm font-semibold text-white transition-colors hover:bg-cool/85 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-mute"
                    >
                      {sceneApplying && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                      套用
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className={FIELD_LABEL}>通知</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedNotifications[area.id] ?? ""}
                      onChange={(e) => setSelectedNotifications((prev) => ({ ...prev, [area.id]: e.target.value }))}
                      disabled={notifications.length === 0 || notificationApplying}
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-elevated px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-cool disabled:cursor-not-allowed disabled:text-mute"
                      aria-label="通知"
                    >
                      {notifications.length === 0 ? (
                        <option value="">無通知</option>
                      ) : notifications.map((notification) => (
                        <option key={notification.key} value={notification.key}>
                          {notification.label || notification.action || notification.key}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => applyNotification(area)}
                      disabled={notifications.length === 0 || notificationApplying}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cool px-3.5 text-sm font-semibold text-white transition-colors hover:bg-cool/85 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-mute"
                    >
                      {notificationApplying && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                      套用
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={FIELD_LABEL}>效果</span>
                    {effects.some((effect) => effect.partial) && (
                      <span className="text-[11px] font-medium text-mute">* 部分支援</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedEffects[area.id] ?? ""}
                      onChange={(e) => setSelectedEffects((prev) => ({ ...prev, [area.id]: e.target.value }))}
                      disabled={effects.length === 0 || effectApplying}
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-elevated px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-cool disabled:cursor-not-allowed disabled:text-mute"
                      aria-label="效果"
                    >
                      {effects.length === 0 ? (
                        <option value="">無效果</option>
                      ) : effects.map((effect) => (
                        <option key={effect.key} value={effect.key}>
                          {effect.label}{effect.partial ? " *" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => applyEffect(area)}
                      disabled={effects.length === 0 || effectApplying}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cool px-3.5 text-sm font-semibold text-white transition-colors hover:bg-cool/85 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-mute"
                    >
                      {effectApplying && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
                      套用
                    </button>
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
                        className="num h-8 w-[4.5rem] rounded-[10px] border border-line bg-elevated px-2 text-right text-sm text-foreground outline-none transition-colors focus:border-cool"
                        aria-label="亮度數值"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className={FIELD_LABEL}>電源</span>
                  <div className="flex items-center justify-start">
                    <Toggle2 value={isOn} onChange={(v) => sendState(area, { on: v })} />
                  </div>
                </div>

                {/* 自動夜燈：時段內亮度 ≤ 門檻且燈關著 → 開場景；亮度 > 門檻 → 關燈；時段結束關燈 */}
                <div className="flex flex-col gap-3 border-t border-line pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <Moon className="h-4 w-4 text-mute" strokeWidth={2} />
                      自動夜燈
                    </span>
                    <Toggle2 value={auto.enabled} onChange={(v) => updateAutoDraft(area, { enabled: v })} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className={FIELD_LABEL}>光感應器</span>
                    <select
                      value={auto.sensor_device_id}
                      onChange={(e) => updateAutoDraft(area, { sensor_device_id: e.target.value })}
                      disabled={autoSensors.length === 0}
                      className="h-9 min-w-0 rounded-[10px] border border-line bg-elevated px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-cool disabled:cursor-not-allowed disabled:text-mute"
                      aria-label="光感應器"
                    >
                      {autoSensors.length === 0 ? (
                        <option value="">無感應器</option>
                      ) : autoSensors.map((sensor) => (
                        <option key={sensor.device_id} value={sensor.device_id}>
                          {sensor.location ? `${sensor.location}・${sensor.name}` : sensor.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={FIELD_LABEL}>亮度門檻（≤ 門檻開燈）</span>
                      <button
                        type="button"
                        onClick={() => probeLightLevel(area)}
                        disabled={!auto.sensor_device_id || autoProbing}
                        title="實測感應器當下亮度（1–20）"
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[11px] font-semibold text-soft transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {autoProbing ? (
                          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                        ) : (
                          <Sun className="h-3 w-3" strokeWidth={2} />
                        )}
                        {probeLabel}
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={clampInt(auto.threshold, 1, 20)}
                        onChange={(e) => updateAutoDraft(area, { threshold: Number(e.target.value) })}
                        className="h-9 flex-1 cursor-pointer accent-cool"
                        aria-label="亮度門檻"
                      />
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={auto.threshold}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isNaN(n)) updateAutoDraft(area, { threshold: n });
                        }}
                        onBlur={() => updateAutoDraft(area, { threshold: clampInt(auto.threshold, 1, 20) })}
                        className="num h-8 w-[4.5rem] rounded-[10px] border border-line bg-elevated px-2 text-right text-sm text-foreground outline-none transition-colors focus:border-cool"
                        aria-label="亮度門檻數值"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className={FIELD_LABEL}>觸發場景</span>
                    <select
                      value={auto.scene_id}
                      onChange={(e) => updateAutoDraft(area, { scene_id: e.target.value })}
                      disabled={scenes.length === 0}
                      className="h-9 min-w-0 rounded-[10px] border border-line bg-elevated px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-cool disabled:cursor-not-allowed disabled:text-mute"
                      aria-label="觸發場景"
                    >
                      {scenes.length === 0 ? (
                        <option value="">無場景</option>
                      ) : scenes.map((scene) => (
                        <option key={scene.id} value={scene.id}>
                          {scene.name || scene.id}{scene.resource_type === "smart_scene" ? " · 全天" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className={FIELD_LABEL}>開燈亮度</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={100}
                        step={1}
                        value={clampBrightness(auto.brightness)}
                        onChange={(e) => updateAutoDraft(area, { brightness: Number(e.target.value) })}
                        className="h-9 flex-1 cursor-pointer accent-fresh"
                        aria-label="開燈亮度"
                      />
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={auto.brightness}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isNaN(n)) updateAutoDraft(area, { brightness: n });
                        }}
                        onBlur={() => updateAutoDraft(area, { brightness: clampBrightness(auto.brightness) })}
                        className="num h-8 w-[4.5rem] rounded-[10px] border border-line bg-elevated px-2 text-right text-sm text-foreground outline-none transition-colors focus:border-cool"
                        aria-label="開燈亮度數值"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className={FIELD_LABEL}>啟用時段（可跨午夜）</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={auto.start_time}
                        onChange={(e) => updateAutoDraft(area, { start_time: e.target.value })}
                        className="num h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-elevated px-3 text-sm text-foreground outline-none transition-colors focus:border-cool"
                        aria-label="開始時間"
                      />
                      <span className="shrink-0 text-xs text-mute">至</span>
                      <input
                        type="time"
                        value={auto.end_time}
                        onChange={(e) => updateAutoDraft(area, { end_time: e.target.value })}
                        className="num h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-elevated px-3 text-sm text-foreground outline-none transition-colors focus:border-cool"
                        aria-label="結束時間"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-mute">
                      {savedAuto?.last_event
                        ? `${AUTO_EVENT_LABEL[savedAuto.last_event] ?? savedAuto.last_event}・${savedAuto.last_event_at ?? ""}`
                        : savedAuto?.enabled
                          ? "等待觸發"
                          : "未啟用"}
                    </span>
                    <button
                      type="button"
                      onClick={() => saveAutoRule(area)}
                      disabled={!autoDirty || autoSaving}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-cool px-3.5 text-sm font-semibold text-white transition-colors hover:bg-cool/85 disabled:cursor-not-allowed disabled:bg-elevated disabled:text-mute"
                    >
                      {autoSaving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <Save className="h-4 w-4" strokeWidth={2} />}
                      儲存
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
