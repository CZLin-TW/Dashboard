"use client";

import { useState } from "react";
import { ago, send, type Ac, type Dehumidifier, type DevicesPage, type History, type Ir } from "@/lib/api";
import { dehumidifierSegments, optionValue, sensorHistory, type UiDevice } from "@/lib/devices";
import { Minus, Plus } from "lucide-react";
import { Segment, Dropdown, Field, StatusLine, ControlDetails, SettingGroup, SettingRow, Switch } from "./device-controls";
import { Collapse } from "./collapse";
// 兩張圖走 lazy-charts 的非同步 chunk：控制面板不該等 recharts 下載完才能互動。
import { AutoModeChart, HumidityCurveChart } from "@/components/devices/lazy-charts";

// ─────────────────────────────────────────────────────────────
// 單一裝置的控制（裝置頁、首頁快速控制共用）。HomeButler 的指令在 HA／雲端確認後才回應，
// 所以送出後重讀一次整頁就是最新狀態，不再輪詢猜測是否生效。結果「未確認」時不重送，
// 只請使用者先看設備。
// ─────────────────────────────────────────────────────────────

interface Props {
  device: UiDevice;
  page: DevicesPage;
  /** Commands and rule changes call this afterwards; the parent reads the page again. */
  onChanged: () => Promise<void> | void;
  history?: History | null;
}

export function DeviceController({ device, page, onChanged, history = null }: Props) {
  if (device.kind === "ac") return <AcControl ac={device.ac} page={page} onChanged={onChanged} />;
  if (device.kind === "dehumidifier") return <DehumidifierControl unit={device.dehumidifier} page={page} onChanged={onChanged} history={history} />;
  if (device.kind === "ir") return <IrControl ir={device.ir} />;
  return null;
}

function failureText(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 504) return "指令結果未確認，請先查看設備；系統不會自動重送。";
  return error instanceof Error ? error.message : "送出失敗，請稍後重試。";
}

// ── AC ──────────────────────────────────────────────────────

interface AcDraft { power: boolean; temperature: number; mode: string; fan: string }

function acBaseline(ac: Ac, page: DevicesPage): AcDraft {
  const { modes, fan_speeds } = page.options.ac;
  return { power: ac.power === "on", temperature: ac.temperature ?? 26,
    mode: optionValue(modes, ac.mode) || "cool", fan: optionValue(fan_speeds, ac.fan) || "auto" };
}

function AcControl({ ac, page, onChanged }: { ac: Ac; page: DevicesPage; onChanged: () => Promise<void> | void }) {
  const [draft, setDraft] = useState<AcDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const options = page.options.ac;
  if (!ac.available) return <p className="text-sm text-mute">HA 空調狀態未知，暫時無法控制。連線恢復後會重新顯示目前設定。</p>;
  const baseline = acBaseline(ac, page);
  const p = draft ?? baseline;
  const dirty = (Object.keys(p) as (keyof AcDraft)[]).some((k) => p[k] !== baseline[k]);
  const update = (changes: Partial<AcDraft>) => setDraft({ ...p, ...changes });
  const label = (list: { value: string; label: string }[], value: string) => list.find((o) => o.value === value)?.label ?? value;

  async function submit() {
    setSending(true);
    setNotice(null);
    let sent = false;
    try {
      await send("POST", `devices/ac/${encodeURIComponent(ac.name)}`,
        p.power ? { power: "on", temperature: p.temperature, mode: p.mode, fan_speed: p.fan } : { power: "off" });
      sent = true;
    } catch (error) {
      setNotice(failureText(error));
    } finally {
      await onChanged();
      // The draft goes only once the page is read again: dropping it earlier showed the old settings until then.
      if (sent) setDraft(null);
      setSending(false);
    }
  }

  return (
    <>
      {ac.uncertain && <p className="text-xs text-warm">上次指令結果未知，請先確認空調；可重新指定完整設定。</p>}
      {sending && <StatusLine tone="waiting" text={p.power ? `送出中：${p.temperature}°C ${label(options.modes, p.mode)} ${label(options.fan_speeds, p.fan)}` : "送出中：關閉"} />}
      {notice && <div className="rounded-[10px] bg-elevated px-2.5 py-2 text-[11.5px] leading-snug text-warm">{notice}</div>}
      {/* 主控制：電源一列，下面是大字溫度與左右兩顆圓鈕；關機時溫度淡出但仍可先調好再開。 */}
      <div className="rounded-[18px] bg-surface-2">
        <SettingRow label="電源">
          <Switch value={p.power} onChange={(v) => update({ power: v })} disabled={sending} label="電源" />
        </SettingRow>
        <div className={`flex items-center justify-between gap-3 border-t border-line/60 px-3.5 py-4 transition-opacity ${p.power ? "" : "opacity-45"}`}>
          <RoundStep label="降低溫度" disabled={sending || p.temperature <= options.temperature.min}
            onClick={() => update({ temperature: Math.max(options.temperature.min, p.temperature - 1) })}><Minus className="h-5 w-5" strokeWidth={2.2} /></RoundStep>
          <span className="flex flex-col items-center">
            <span className="num text-[44px] font-semibold leading-none tracking-[-0.04em] text-foreground">
              {p.temperature}<span className="ml-0.5 align-top text-[18px] font-semibold text-mute">°C</span>
            </span>
            <span className="mt-1.5 text-[11.5px] text-mute">設定溫度</span>
          </span>
          <RoundStep label="提高溫度" disabled={sending || p.temperature >= options.temperature.max}
            onClick={() => update({ temperature: Math.min(options.temperature.max, p.temperature + 1) })}><Plus className="h-5 w-5" strokeWidth={2.2} /></RoundStep>
        </div>
      </div>
      <ControlDetails title="模式與風速" summary={[label(options.modes, p.mode), label(options.fan_speeds, p.fan)].join(" · ")}>
        <Field label="模式">
          <Segment options={options.modes} value={p.mode} onSelect={(v) => update({ mode: v })} disabled={sending} />
        </Field>
        <Field label="風速">
          <Segment options={options.fan_speeds} value={p.fan} onSelect={(v) => update({ fan: v })} disabled={sending} />
        </Field>
      </ControlDetails>
      {/* 有改動才出現送出鈕：沒改動時一顆灰色「未變更」只是雜訊。 */}
      <Collapse open={dirty || sending}>
        <button type="button" onClick={submit} disabled={sending || !dirty}
          className={`inline-flex min-h-[46px] w-full items-center justify-center rounded-full px-4 py-2 text-[15px] font-semibold text-white transition-colors ${
            sending ? "bg-amber animate-pulse" : "bg-cool hover:bg-cool/85"}`}>
          {sending ? "送出中..." : "送出設定"}
        </button>
      </Collapse>
    </>
  );
}

/** 冷氣溫度兩側的大圓鈕。 */
function RoundStep({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-soft shadow-[0_2px_8px_-4px_rgba(31,36,43,0.3)] transition-colors hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
      {children}
    </button>
  );
}

// ── Dehumidifier ────────────────────────────────────────────

const DURATION_OPTIONS = [0, 5, 10, 15, 20, 25, 30].map((v) => ({ value: v, label: v === 0 ? "立即" : `${v} 分` }));
// 自動模式的目標濕度（規則自己的門檻，跟機體的目標濕度無關）；「自訂」＝依感應器的分時曲線。
const CUSTOM = "custom";
const THRESHOLD_OPTIONS = [...[45, 50, 55, 60, 65].map((v) => ({ value: String(v), label: `${v}%` })), { value: CUSTOM, label: "自訂（分時）" }];

function DehumidifierControl({ unit, page, onChanged, history }: { unit: Dehumidifier; page: DevicesPage;
  onChanged: () => Promise<void> | void; history: History | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rule = unit.rule;
  const status = unit.status;
  const autoOn = rule.auto_mode;
  const custom = rule.threshold_source === CUSTOM;
  const disabled = busy !== null || !unit.controllable;

  async function act(what: string, path: string, method: "POST" | "PUT", body: Record<string, unknown>) {
    setBusy(what);
    setNotice(null);
    try {
      await send(method, `dehumidifiers/${encodeURIComponent(unit.name)}/${path}`, body);
    } catch (error) {
      setNotice(failureText(error));
    } finally {
      await onChanged();
      setBusy(null);
    }
  }
  const command = (body: Record<string, unknown>) => act("command", "control", "POST", body);
  const setRule = (changes: Record<string, unknown>) => act("rule", "rule", "PUT", { auto_mode: autoOn, ...changes });

  const phaseText = !autoOn ? null
    : rule.phase === "armed_above" ? `已連續超過門檻，再 ${rule.countdown_min ?? "?"} 分觸發開啟`
    : rule.phase === "armed_below" ? `已連續低於門檻，再 ${rule.countdown_min ?? "?"} 分觸發關閉`
    : rule.phase === "sensor_lost_warning" ? "感測器沒有回報，1 小時內未恢復將自動解除" : null;
  const canSetHumidity = !unit.options.humidity_needs_mode || status.mode === unit.options.humidity_needs_mode;
  const target = parseInt(String(status.target).replace("%", ""), 10);
  const sensors = page.sensors.map((s) => ({ value: s.name, label: s.name }));

  return (
    <>
      {!unit.controllable && <p className="text-xs text-warm">缺少控制資訊（Device ID、帳號或憑證），無法控制。</p>}
      {busy && <StatusLine tone="waiting" text="送出中…" />}
      {status.error && <p className="text-xs text-warm">最近一次讀取失敗：{status.error}</p>}
      {notice && <div className="rounded-[10px] bg-elevated px-2.5 py-2 text-[11.5px] leading-snug text-warm">{notice}</div>}
      <SettingGroup>
        <SettingRow label="電源" hint={autoOn ? "自動模式控制中" : status.mode ? `${status.mode}${status.target && canSetHumidity ? ` · 目標 ${status.target}` : ""}` : undefined}>
          <Switch value={!!status.power} onChange={(v) => command({ power: v ? "on" : "off" })} disabled={disabled || autoOn} label="電源" />
        </SettingRow>
        <SettingRow label="自動模式" hint={autoOn ? `目標 ${rule.effective_threshold}%${custom ? "（分時）" : ""}${status.updated_at ? ` · ${ago(status.updated_at)}更新` : ""}` : undefined}>
          <Switch value={autoOn} onChange={(v) => setRule({ auto_mode: v })} disabled={disabled} label="自動模式" />
        </SettingRow>
      </SettingGroup>
      {phaseText && <StatusLine tone="waiting" text={phaseText} />}
      <ControlDetails title="自動模式設定" summary={`${rule.duration_min} 分 · ${rule.sensor_name || "未選感測器"}`}>
        <Field label="監控時間" className="min-w-0">
          <Dropdown options={DURATION_OPTIONS} value={rule.duration_min} onSelect={(v) => setRule({ duration_min: v })} disabled={disabled} className="w-full" />
        </Field>
        {/* 自動模式開著時只鎖「感測器」：換感測器等於整個規則換對象，其餘可即時改。 */}
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label="監控感測器" className="min-w-0">
            <Dropdown options={sensors} value={rule.sensor_name || undefined} onSelect={(v) => setRule({ sensor_name: v })}
              disabled={disabled || autoOn} className="w-full" />
          </Field>
          <Field label="目標濕度" className="min-w-0">
            <Dropdown className="w-full" options={THRESHOLD_OPTIONS} value={custom ? CUSTOM : String(rule.threshold)} disabled={disabled}
              onSelect={(v) => v === CUSTOM ? setRule({ threshold_source: CUSTOM }) : setRule({ threshold: Number(v), threshold_source: "fixed" })} />
          </Field>
          {custom && (
            <div className="col-span-2 min-w-0">
              <HumidityCurveChart curve={rule.curve} error={rule.curve_error} fallbackThreshold={rule.threshold} />
            </div>
          )}
        </div>
      </ControlDetails>
      <ControlDetails title="手動模式與濕度" summary={autoOn ? "自動模式控制中" : status.mode || "尚無狀態"}>
        <Field label="模式">
          <Segment options={unit.options.modes.map((m) => ({ value: m, label: m }))} value={status.mode || undefined}
            onSelect={(v) => command({ mode: v })} disabled={disabled || autoOn} />
        </Field>
        {!autoOn && canSetHumidity && (
          <Field label="目標濕度">
            <Segment options={unit.options.humidity.map((h) => ({ value: h, label: `${h}%` }))} value={Number.isFinite(target) ? target : undefined}
              onSelect={(v) => command({ humidity: v })} disabled={disabled} />
          </Field>
        )}
      </ControlDetails>
      {autoOn && history && (
        <ControlDetails title="濕度趨勢" summary="過去 24 小時">
          <AutoModeChart sensorHistory={sensorHistory(history, rule.sensor_name)} onSegments={dehumidifierSegments(history, unit.name)}
            humidityOnThreshold={rule.on_at} humidityOffThreshold={rule.off_at} />
        </ControlDetails>
      )}
    </>
  );
}

// ── IR ──────────────────────────────────────────────────────

function IrControl({ ir }: { ir: Ir }) {
  // 單向發送：tap 顯示琥珀色表示送出中，失敗顯示紅色；沒有「成功」狀態，因為 IR 沒有回讀。
  const [tap, setTap] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ button: string; message: string } | null>(null);

  async function press(button: string) {
    setTap(button);
    setFailed(null);
    try {
      await send("POST", `devices/ir/${encodeURIComponent(ir.name)}`, { button });
    } catch (error) {
      setFailed({ button, message: failureText(error) });
      setTimeout(() => setFailed((cur) => (cur?.button === button ? null : cur)), 4000);
    } finally {
      setTap((cur) => (cur === button ? null : cur));
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {ir.buttons.map(({ label, available }) => {
          const stateCls = failed?.button === label ? "border-transparent bg-warm text-white animate-pulse"
            : tap === label ? "border-transparent bg-amber text-white scale-[0.97]"
            : "border-transparent bg-surface-2 text-soft hover:bg-elevated active:scale-[0.97]";
          return (
            <button key={label} type="button" onClick={() => press(label)} disabled={!available || tap !== null}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-[16px] border px-2 text-[14px] font-medium transition-all duration-150 disabled:opacity-50 ${stateCls}`}>
              {label}
            </button>
          );
        })}
      </div>
      {failed && <p className="mt-2 text-xs text-warm">{failed.button}：{failed.message}</p>}
    </div>
  );
}
