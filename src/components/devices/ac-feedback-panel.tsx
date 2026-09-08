"use client";
import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useUser } from "@/hooks/use-user";
import { AC_FEEDBACK_DEFAULTS, AC_FEEDBACK_STATUS, type AcFeedbackConfig, type AcFeedbackResponse } from "@/lib/ac-feedback";
import type { DeviceData } from "@/lib/types";

export function AcFeedbackPanel({ device, onSettingsSaved }: { device: DeviceData; onSettingsSaved?: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { currentUser } = useUser();
  if (currentUser?.role === "kid") return null;
  return <section className="border-t border-line/80 pt-3">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className="flex min-h-[38px] w-full items-center justify-between gap-2 text-left text-sm font-medium text-foreground">
      溫度回饋補償<ChevronDown className={`h-4 w-4 text-mute transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div id={id}><FeedbackSettings device={device} onSettingsSaved={onSettingsSaved} /></div>}
  </section>;
}

function FeedbackSettings({ device, onSettingsSaved }: { device: DeviceData; onSettingsSaved?: () => Promise<void> | void }) {
  const { data, error, loading, refetch } = useCachedFetch<AcFeedbackResponse | null>("/api/ac/feedback", null);
  const [draft, setDraft] = useState<AcFeedbackConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { void refetch(); }, [refetch, device.lastTemperature, device.lastPower, device.lastMode, device.lastUpdatedAt]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) void refetch(); }, 60_000);
    return () => clearInterval(timer);
  }, [refetch]);
  const live = data?.devices[device.name];
  if (!live) return <div className="space-y-2 py-3 text-sm text-mute">
    <p>{error ? "回饋設定讀取失敗" : loading ? "讀取回饋設定…" : "找不到此空調的回饋設定"}</p>
    <button type="button" onClick={() => void refetch()} className="text-cool">重新讀取</button>
  </div>;
  const cfg = draft ?? live.config;
  const change = (patch: Partial<AcFeedbackConfig>) => { setDraft({ ...cfg, ...patch }); setNotice(""); };
  const sensors = data!.sensors.filter(s => s.location === device.location);
  const numberText = (v: number | null) => v === null ? "—" : `${v}°C`;
  const offset = live.ir_temperature !== null && live.target_temperature !== null
    ? live.ir_temperature - live.target_temperature : null;
  async function save() {
    if (saving) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/ac/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_name: device.name, ...(draft ? { config: cfg } : {}), evaluate_now: cfg.enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "設定保存失敗");
      await refetch(); setDraft(null);
      if (draft) await onSettingsSaved?.();
      const status = result.evaluation?.status;
      setNotice(status
        ? `${draft ? "設定已保存；" : ""}${status === "compensating" ? "已送出一次補償調整。" : `已評估：${AC_FEEDBACK_STATUS[status] ?? "結果未確認，請重新讀取"}。`}`
        : "設定已保存，回饋已停用。");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "設定未確認，請重新讀取");
      await refetch();
    } finally { setSaving(false); }
  }
  const fieldClass = "mt-1 min-h-[38px] w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-1.5 text-base text-foreground";
  return <div className="space-y-4 pt-3">
    <p className="text-xs leading-relaxed text-mute">依外部室溫微調冷／暖房設定，面板目標保持不變。只在已開機時介入，不負責開關機。</p>
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-center">
      {[["感測室溫", numberText(live.sensor_temperature)], ["舒適目標", numberText(live.target_temperature)], ["IR 下發", numberText(live.ir_temperature)]].map(([label, value]) =>
        <div key={label}><p className="text-[11px] text-mute">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p></div>)}
    </div>
    <p className="text-xs leading-relaxed text-mute" role="status">
      {error ? "資料更新失敗，以下為上次讀取內容。" : AC_FEEDBACK_STATUS[live.status] ?? "等待評估"}
      {offset !== null && ` · 補償 ${offset > 0 ? "+" : ""}${offset}°C`}
    </p>
    <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
      <fieldset disabled={saving || !!error} className="min-w-0 space-y-4 disabled:opacity-60">
        <label className="flex min-h-[38px] items-center justify-between gap-3 text-sm text-foreground">
          啟用溫度回饋<input type="checkbox" checked={cfg.enabled} onChange={e => change({ enabled: e.target.checked })} className="h-5 w-5 accent-cool" />
        </label>
        <label className="block text-xs text-mute">溫度感測器
          <select required={cfg.enabled} value={cfg.sensor_name} onChange={e => change({ sensor_name: e.target.value })} className={fieldClass}>
            <option value="">選擇同房間感測器</option>
            {cfg.sensor_name && !sensors.some(s => s.name === cfg.sensor_name) && <option value={cfg.sensor_name}>{cfg.sensor_name}（已不可用）</option>}
            {sensors.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </label>
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm text-foreground">進階設定</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
              ["interval_min", "評估間隔（分鐘）", 5, 30, 1], ["tolerance", "容許溫差（±°C）", 0.3, 2, 0.1],
              ["step", "每次調整（°C）", 1, 2, 1], ["min_adjust_min", "最短調整間隔（分鐘）", 5, 60, 1],
              ["max_offset", "最大補償（±°C）", 1, 5, 1],
            ] as const).map(([key, label, min, max, step]) => <label key={key} className="block text-xs text-mute">{label}
              <input required type="number" min={min} max={max} step={step} value={cfg[key]}
                onChange={e => change({ [key]: e.target.valueAsNumber })} className={fieldClass} />
            </label>)}
          </div>
          <button type="button" onClick={() => change({ ...AC_FEEDBACK_DEFAULTS, enabled: cfg.enabled, sensor_name: cfg.sensor_name })}
            className="mt-3 min-h-[38px] text-xs font-medium text-cool">恢復進階預設值</button>
          <p className="mt-1 text-xs leading-relaxed text-mute">感測器目前約每 5 分鐘更新；相同讀值時間不會重複調整。達標後保持補償，不立即歸零。</p>
        </details>
        <button type="submit" disabled={!draft && !cfg.enabled} className="min-h-[38px] w-full rounded-full bg-cool px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "處理中…" : draft ? cfg.enabled ? "保存並立即評估" : "保存回饋設定" : cfg.enabled ? "立即評估" : "回饋已停用"}
        </button>
        <p className="text-xs leading-relaxed text-mute">立即評估會使用目前的感測讀值；符合補償條件才送出 IR，仍遵守最短調整間隔。</p>
      </fieldset>
    </form>
    {notice && <p role="status" className="text-xs text-cool">{notice}</p>}
    <p className="text-[11px] leading-relaxed text-mute">停用會將面板目標四捨五入為整數，保留目前 IR 設定；下次手動送出設定才套用目標。IR 無法讀回實體狀態，啟用期間請透過管家或 Apple Home 關機。</p>
  </div>;
}
