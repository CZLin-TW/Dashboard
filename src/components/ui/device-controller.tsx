"use client";

import { useState } from "react";
import {
  type DeviceData,
  type DeviceOptions,
  type DehumidifierAutoRule,
  type AcPendingState,
  acPendingFromDevice,
} from "@/lib/types";
import type { Sensor } from "@/lib/sensor";
import type { DehumDevice } from "@/lib/dehumidifier";
import { dehumHistoryToSegments } from "@/lib/dehumidifier";
import { Toggle2, Stepper, Segment, Dropdown, Field, StatusLine } from "./device-controls";
import { AutoModeChart } from "@/components/devices/auto-mode-chart";

const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "立即" },
  { value: 5, label: "5 分" },
  { value: 10, label: "10 分" },
  { value: 15, label: "15 分" },
  { value: 20, label: "20 分" },
  { value: 25, label: "25 分" },
  { value: 30, label: "30 分" },
];

// 自動模式門檻 dropdown：45~65 step 5。auto rule 自己的判斷門檻，跟除濕機
// 機體目標濕度（40~70）獨立。連續除濕模式下機器不看自己的目標濕度，所以
// auto rule 的 threshold 純粹是「比 sensor 讀值 vs 門檻」的數值，跟機器無關。
const THRESHOLD_OPTIONS: { value: number; label: string }[] = [
  { value: 45, label: "45%" },
  { value: 50, label: "50%" },
  { value: 55, label: "55%" },
  { value: 60, label: "60%" },
  { value: 65, label: "65%" },
];
const THRESHOLD_DEFAULT = 60;

// 各品牌自動模式用的「持續除濕」等效模式（要跟 home-butler 端一致）：
// 機器跑滿、不看自身目標濕度，由外部 sensor + hysteresis 控制 on/off。
const CONTINUOUS_MODE_BY_BRAND: Record<string, string> = {
  Panasonic: "連續除濕",
  LG: "智慧除濕",
};

// ─────────────────────────────────────────────────────────────
// 單一裝置的控制邏輯（state + send + render fields）— 裝置頁、首頁
// device-quick-control 共用。Sensor 不走這裡（純顯示沒控制邏輯，由
// 各頁自己 render，只共用 ClimateReadout）。
//
// 設計：每個 instance 對應一台 device，state 在 instance 內（不再用
// keyed-by-name 的 map）。Caller 提供 device + options + 兩個成功回呼，
// 自己決定 outer wrapper（panel grid / motion tile expanded）。
//
// 已知 trade-off：home tile 收合時 controller unmount，AC pending 草稿
// 會清空（之前 keyed-by-name map 在 parent 不會清）。實際 UX：使用者
// 「展開 → 改 → 收合 → 再展開」會看到原本草稿消失。可接受 — 重要的
// 是「展開 → 改 → 送」這條主線，draft 跨 collapse 持久不是必要功能。
// ─────────────────────────────────────────────────────────────

interface Props {
  device: DeviceData;
  options: DeviceOptions;
  /** AC 指令送出且輪詢確認 last 狀態到位後呼叫，由父層 refetch /api/devices/status。
   *  失敗（10 秒沒匹配）也會呼叫，讓 UI 顯示最新真實狀態。 */
  onAcCommandSuccess?: () => Promise<void> | void;
  /** 除濕機指令送出且輪詢確認後呼叫，由父層 refetch /api/devices/status。
   *  失敗（10 秒沒匹配）也會呼叫。 */
  onDehumidifierCommandSuccess?: () => Promise<void> | void;
  /** 除濕機自動規則（home-butler 取回）。null 表示這台從未設過規則。 */
  dehumRule?: DehumidifierAutoRule | null;
  /** 可選的感測器名稱清單，給自動規則下拉用。 */
  availableSensors?: string[];
  /** 規則設定後呼叫，父層 refetch /api/dehumidifier/auto-rule。 */
  onDehumRuleUpdate?: () => Promise<void> | void;
  /** 全部 sensor 的歷史 map，給自動模式 chart 撈綁定 sensor 的 24h 濕度線用。 */
  sensorsMap?: Record<string, Sensor>;
  /** 全部除濕機 power 歷史 map（key=device_name），給自動模式 chart 的綠色背景區段用。 */
  dehumHistoryMap?: Record<string, DehumDevice>;
}

export function DeviceController({
  device,
  options,
  onAcCommandSuccess,
  onDehumidifierCommandSuccess,
  dehumRule,
  availableSensors,
  onDehumRuleUpdate,
  sensorsMap,
  dehumHistoryMap,
}: Props) {
  const [pending, setPending] = useState<AcPendingState | null>(null);
  const [acFailed, setAcFailed] = useState(false);
  const [acAwaiting, setAcAwaiting] = useState(false);
  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const [autoRulePending, setAutoRulePending] = useState(false);
  const [autoModePending, setAutoModePending] = useState<boolean | null>(null);
  // IR fire-and-forget：tap 顯示 fresh 綠表示「指令送出中」，failed 顯示 warm 紅。
  // 不做 success state——HTTP 200 只代表 Hub 收到、不代表裝置真的動作了，給綠燈會誤導。
  const [irTap, setIrTap] = useState<string | null>(null);
  const [irFailed, setIrFailed] = useState<{ button: string; message: string } | null>(null);

  function getAcPending(): AcPendingState {
    return pending ?? acPendingFromDevice(device);
  }

  /** pending 是否與 device 的 last* baseline 不同（純值比對 — 任一欄位
   *  不同就算 dirty，跟 OFF/ON 都一視同仁）。 */
  function isAcDirty(): boolean {
    const p = getAcPending();
    const baseline = acPendingFromDevice(device);
    return (
      p.power !== baseline.power ||
      p.temperature !== baseline.temperature ||
      p.mode !== baseline.mode ||
      p.fanSpeed !== baseline.fanSpeed
    );
  }

  function updateAcPending(updates: Partial<AcPendingState>) {
    const current = pending ?? acPendingFromDevice(device);
    setPending({ ...current, ...updates });
  }

  function flashAcFailed() {
    setAcFailed(true);
    setTimeout(() => setAcFailed(false), 2000);
  }

  function flashDhFailed(expected: { type: string; value: unknown }) {
    setDhFailed(expected);
    setTimeout(() => setDhFailed(null), 5000);
  }

  async function sendAcCommand() {
    const p = getAcPending();
    setAcAwaiting(true);
    setSending(true);
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "setAll", params: p }),
      });
      if (!res.ok) {
        console.error(`[sendAcCommand] ${device.name} failed: HTTP ${res.status}`);
        setAcAwaiting(false);
        flashAcFailed();
        return;
      }

      // AC 是 IR 單向、沒法回讀真實狀態。home-butler 寫回 Sheet 並同步更新
      // /api/devices/status 的 last-* cache，當作「已生效」訊號。10 秒內每秒輪詢，
      // pending 跟 device.last* 匹配才清 pending、解鎖。OFF 時只比 power、ON 時四個
      // 欄位都要對齊。
      const statusUrl = `/api/devices/status?name=${encodeURIComponent(device.name)}`;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const r2 = await fetch(statusUrl);
          const data = await r2.json();
          const d: DeviceData | undefined = data?.[device.name];
          if (d) {
            const rawTemp = d.lastTemperature;
            const tempNum =
              typeof rawTemp === "number" ? rawTemp :
              typeof rawTemp === "string" && rawTemp.trim() !== "" ? parseInt(rawTemp, 10) : NaN;
            const matched = p.power
              ? d.lastPower === "on" &&
                tempNum === p.temperature &&
                (d.lastMode || "") === p.mode &&
                (d.lastFanSpeed || "") === p.fanSpeed
              : d.lastPower === "off";
            if (matched) {
              if (onAcCommandSuccess) await onAcCommandSuccess();
              setPending(null);
              setAcAwaiting(false);
              return;
            }
          }
        } catch { /* continue polling */ }
      }

      // 10 秒沒匹配 → 失敗閃紅；仍 refetch 一次避免 UI 跟實際長期不一致
      setAcAwaiting(false);
      flashAcFailed();
      if (onAcCommandSuccess) onAcCommandSuccess();
    } catch (err) {
      console.error(`[sendAcCommand] ${device.name} network error:`, err);
      setAcAwaiting(false);
      flashAcFailed();
    } finally {
      setSending(false);
    }
  }

  async function sendDehumidifierCommand(params: Record<string, unknown>): Promise<boolean> {
    // 推算這次操作期望的「最終狀態」，輪詢時用這個來判斷是否已生效
    const expected: { type: string; value: unknown } =
      params.power !== undefined ? { type: "power", value: params.power } :
      params.mode !== undefined ? { type: "mode", value: params.mode } :
      { type: "humidity", value: params.humidity };

    setDhPending(expected);
    setDhFailed(null);
    setSending(true);

    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "dehumidifier", params }),
      });
      if (!res.ok) {
        console.error(`[sendDehumidifierCommand] ${device.name} failed: HTTP ${res.status}`);
        setDhPending(null);
        flashDhFailed(expected);
        return false;
      }

      // ?name= 只查該裝置，避免被其他雲端慢的除濕機拖累 endpoint latency
      const statusUrl = `/api/devices/status?name=${encodeURIComponent(device.name)}`;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const res = await fetch(statusUrl);
          const data = await res.json();
          const dh = data?.[device.name];
          if (dh) {
            const matched =
              (expected.type === "power" && dh.power === expected.value) ||
              (expected.type === "mode" && dh.mode === expected.value) ||
              (expected.type === "humidity" && String(dh.targetHumidity) === `${expected.value}%`);
            if (matched) {
              if (onDehumidifierCommandSuccess) await onDehumidifierCommandSuccess();
              setDhPending(null);
              return true;
            }
          }
        } catch { /* continue polling */ }
      }

      // 30 秒後還沒匹配 → 標 failed 閃 5s，仍 refetch 避免顯示與實際不一致
      if (onDehumidifierCommandSuccess) await onDehumidifierCommandSuccess();
      setDhPending(null);
      flashDhFailed(expected);
      return false;
    } catch (err) {
      console.error(`[sendDehumidifierCommand] ${device.name} network error:`, err);
      setDhPending(null);
      flashDhFailed(expected);
      return false;
    } finally {
      setSending(false);
    }
  }

  async function sendAutoRuleUpdate(patch: {
    auto_mode?: boolean;
    sensor_name?: string;
    duration_min?: number;
    threshold?: number;
  }) {
    if (patch.auto_mode !== undefined) {
      setAutoModePending(patch.auto_mode);
    }
    setAutoRulePending(true);

    const isTogglingOn = patch.auto_mode === true && !dehumRule?.auto_mode;
    const continuousMode = CONTINUOUS_MODE_BY_BRAND[device.brand || "Panasonic"] ?? "連續除濕";

    // 進入自動模式前：若除濕機現在開著，先送 mode 切換指令把模式改成持續除濕
    // 再 POST rule（一定要 await 完成才 POST rule，否則 home-butler 已經
    // is_locked=true 會擋掉 mode 切換）。device OFF 時不切，等規則之後
    // fire ON 時後端會一起送 turn_on + set_mode 持續除濕。
    //
    // 為什麼一定要切持續除濕：其他模式（尤其「目標濕度」）除濕機會看
    // 機體周邊濕度自己達標停機，但外部 sensor 還沒到 → 永遠 trigger 不
    // 到 auto-OFF。持續除濕忽略內部判定，控制權完全交給外部 sensor +
    // hysteresis。模式名稱依品牌（Panasonic 連續除濕 / LG 智慧除濕）。
    try {
      if (isTogglingOn && device.power) {
        const modeReady = await sendDehumidifierCommand({ mode: continuousMode });
        if (!modeReady) return;
      }

      const body: Record<string, unknown> = {
        device_name: device.name,
        auto_mode: patch.auto_mode ?? dehumRule?.auto_mode ?? false,
      };
      if (patch.sensor_name !== undefined) body.sensor_name = patch.sensor_name;
      if (patch.duration_min !== undefined) body.duration_min = patch.duration_min;
      if (patch.threshold !== undefined) body.threshold = patch.threshold;
      // Toggle ON 時：若 rule.threshold 從未設過，帶入 dropdown 預設值，避免後端 fallback
      // 跟 UI 顯示對不上。on_mode 帶品牌對應的持續除濕模式（後端會忽略 caller 傳值但保留
      // 給 Sheet schema 一致）。
      if (isTogglingOn) {
        if (body.threshold === undefined) {
          body.threshold = dehumRule?.threshold ?? THRESHOLD_DEFAULT;
        }
        body.on_mode = continuousMode;
      }

      const res = await fetch("/api/dehumidifier/auto-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (onDehumRuleUpdate) await onDehumRuleUpdate();
      if (onDehumidifierCommandSuccess) await onDehumidifierCommandSuccess();
    } catch (err) {
      console.error(`[autoRule] ${device.name} error:`, err);
    } finally {
      setAutoRulePending(false);
      setAutoModePending(null);
    }
  }

  async function sendIrCommand(button: string) {
    setIrTap(button);
    setIrFailed(null);
    // tap 動畫長 ~250ms 就淡掉，獨立於 fetch。fetch 通常更快，但若慢於 250ms
    // 也不延長 tap——tap 是「點擊回饋」，fetch 結果靠 failed state 表達。
    setTimeout(() => setIrTap((cur) => (cur === button ? null : cur)), 250);
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "ir", params: { button } }),
      });
      if (!res.ok) {
        console.error(`[sendIrCommand] ${device.name}/${button} failed: HTTP ${res.status}`);
        setIrFailed({ button, message: `送出失敗（HTTP ${res.status}）` });
        setTimeout(() => setIrFailed((cur) => (cur?.button === button ? null : cur)), 2000);
      }
    } catch (err) {
      console.error(`[sendIrCommand] ${device.name}/${button} network error:`, err);
      setIrFailed({ button, message: "送出失敗（網路錯誤）" });
      setTimeout(() => setIrFailed((cur) => (cur?.button === button ? null : cur)), 2000);
    }
  }

  // ─── 渲染分派 ───────────────────────────────────────────

  if (device.type === "空調") {
    const p = getAcPending();
    const dirty = isAcDirty();
    const lastTime = device.lastUpdatedAt
      ? device.lastUpdatedAt.split(" ")[1] || device.lastUpdatedAt
      : undefined;

    return (
      <>
        {device.lastPower || acAwaiting ? (
          <StatusLine
            tone={acAwaiting ? "waiting" : device.lastPower === "on" ? "running" : "off"}
            text={
              acAwaiting
                ? p.power
                  ? `送出中：${p.temperature}°C ${p.mode} ${p.fanSpeed}`.trim()
                  : "送出中：關閉"
                : device.lastPower === "on"
                ? `${device.lastTemperature ?? ""}°C ${device.lastMode ?? ""} ${device.lastFanSpeed ?? ""}`.trim()
                : "關閉"
            }
            time={lastTime}
          />
        ) : (
          <p className="text-xs text-mute">尚無使用記錄</p>
        )}

        <Field label="電源">
          <Toggle2 value={p.power} onChange={(v) => updateAcPending({ power: v })} />
        </Field>

        <Field label="溫度">
          <Stepper
            value={p.temperature}
            onMinus={() => updateAcPending({ temperature: Math.max(options.ac.temperature.min, p.temperature - 1) })}
            onPlus={() => updateAcPending({ temperature: Math.min(options.ac.temperature.max, p.temperature + 1) })}
          />
        </Field>

        <Field label="模式">
          <Segment options={options.ac.modes} value={p.mode} onSelect={(v) => updateAcPending({ mode: v })} />
        </Field>

        <Field label="風速">
          <Segment
            options={options.ac.fan_speeds}
            value={p.fanSpeed}
            onSelect={(v) => updateAcPending({ fanSpeed: v })}
          />
        </Field>

        <button
          type="button"
          onClick={sendAcCommand}
          disabled={sending || acAwaiting}
          className={`inline-flex w-full items-center justify-center rounded-full border py-[5px] text-sm font-semibold leading-[20px] transition-colors ${
            acFailed
              ? "border-transparent bg-warm text-white animate-pulse"
              : acAwaiting
              ? "border-transparent bg-amber-500 text-white animate-pulse"
              : dirty
              ? "border-transparent bg-fresh text-white hover:bg-fresh/85"
              : "border-dashed border-line-strong bg-elevated text-mute"
          }`}
        >
          {acFailed
            ? "失敗，請重試"
            : sending
            ? "送出中..."
            : acAwaiting
            ? "確認中..."
            : dirty
            ? "送出設定"
            : "未變更"}
        </button>
      </>
    );
  }

  if (device.type === "除濕機") {
    // 依品牌取對應的模式/濕度選項（缺 byBrand 時 fallback 頂層 = Panasonic）
    const dh = options.dehumidifier.byBrand?.[device.brand || "Panasonic"] ?? options.dehumidifier;
    const autoOn = autoModePending ?? (dehumRule?.auto_mode === true);
    // 自動模式 ON 時鎖定電源/模式/目標濕度/感測器/時間，唯一可動的是 auto toggle
    const manualDisabled = dhPending !== null || autoRulePending || autoOn;
    const autoConfigDisabled = autoRulePending || autoOn;

    // Panasonic 機型：只有「目標濕度」mode 才能設目標濕度（其他模式機器自己判斷）。
    // LG 各 mode 都能設目標濕度（智慧除濕 + 目標數字）→ 不受此限制。
    // 用 device.mode（真實 readback），命令送出後等 readback sync 才生效顯示。
    const isPanasonic = (device.brand ?? "Panasonic") === "Panasonic";
    const canSetHumidity = !isPanasonic || device.mode === "目標濕度";

    // 規則 phase 對應的人類可讀文字（只在「值得顯示」時才印一行）
    const phaseText = (() => {
      if (!autoOn) return null;
      const phase = dehumRule?.auto_phase;
      const cd = dehumRule?.countdown_min;
      if (phase === "armed_above")
        return `已連續超過門檻，再 ${cd ?? "?"} 分觸發開啟`;
      if (phase === "armed_below")
        return `已連續低於門檻，再 ${cd ?? "?"} 分觸發關閉`;
      if (phase === "sensor_lost_warning")
        return "感測器離線 ≥30 分，1 小時內未恢復將自動解除";
      return null;
    })();

    return (
      <>
        {device.power !== undefined && (
          <StatusLine
            tone={device.power ? "running" : "off"}
            text={
              autoOn
                ? // 自動模式：不顯示機器實際模式，改顯示「自動模式」；目標顯示規則設定的門檻
                  `${device.power ? "運轉中" : "待機"} · 自動模式${
                    dehumRule?.threshold != null ? ` · 目標 ${dehumRule.threshold}%` : ""
                  }`
                : device.power
                ? `運轉中${device.mode ? ` · ${device.mode}` : ""}${
                    device.targetHumidity && (!isPanasonic || device.mode === "目標濕度")
                      ? ` · 目標 ${device.targetHumidity}`
                      : ""
                  }`
                : "關閉"
            }
          />
        )}
        {/* Row 1: 電源 toggle + 自動模式 toggle + 監控時間 dropdown（撐滿剩餘寬度，對齊 Row 2 目標濕度右側） */}
        <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
          <Field label="電源">
            <Toggle2
              value={!!device.power}
              onChange={(v) => sendDehumidifierCommand({ power: v })}
              disabled={manualDisabled}
            />
          </Field>
          <Field label="自動模式">
            <Toggle2
              value={autoOn}
              onChange={(v) => sendAutoRuleUpdate({ auto_mode: v })}
              disabled={autoRulePending}
            />
          </Field>
          <Field label="監控時間" className="flex-1 min-w-0">
            <Dropdown
              options={DURATION_OPTIONS}
              value={dehumRule?.duration_min ?? 30}
              onSelect={(v) => sendAutoRuleUpdate({ duration_min: v })}
              disabled={autoRulePending}
              className="w-full"
            />
          </Field>
        </div>
        {/* Row 2: 監控感測器（撐滿剩餘寬度）+ 目標濕度（自然寬，靠右）。
            目標濕度 / 監控時間在 auto ON 時都可即時修改：後端只在 auto_mode 翻轉時
            reset runtime state，改門檻 / 時間不會清計時器，_evaluate_steady 下個 tick
            現撈新值即可。只有「感測器」維持 auto ON lock——換綁定 sensor 會 rebind
            歷史 / 圖表、計時器基準也整個變，才需要鎖。 */}
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <Field label="監控感測器" className="flex-1 min-w-0">
            <Dropdown
              options={(availableSensors ?? []).map((s) => ({ value: s, label: s }))}
              value={dehumRule?.sensor_name || undefined}
              onSelect={(v) => sendAutoRuleUpdate({ sensor_name: v })}
              disabled={autoConfigDisabled}
              className="w-full"
            />
          </Field>
          <Field label="目標濕度">
            <Dropdown
              options={THRESHOLD_OPTIONS}
              value={dehumRule?.threshold ?? THRESHOLD_DEFAULT}
              onSelect={(v) => sendAutoRuleUpdate({ threshold: v })}
              disabled={autoRulePending}
            />
          </Field>
        </div>
        {phaseText && (
          <StatusLine tone="waiting" text={phaseText} />
        )}
        <Field label="模式">
          <Segment
            options={dh.modes}
            value={dh.modes.find((m) => m.label === device.mode)?.value}
            onSelect={(v) => sendDehumidifierCommand({ mode: v })}
            pendingValue={dhPending?.type === "mode" ? (dhPending.value as string) : undefined}
            failedValue={dhFailed?.type === "mode" ? (dhFailed.value as string) : undefined}
            disabled={manualDisabled}
          />
        </Field>
        {/* 機體目標濕度 segment 只在「手動模式 + 機型支援該模式設濕度」時顯示。
            auto ON 時門檻完全由上方 dropdown 管，機器跑在連續除濕、不看自己的目標濕度；
            Panasonic 在非「目標濕度」mode（連續除濕/防霉抑菌/空氣清淨/AI舒適）也不看
            目標濕度設定 — 兩種情境都隱藏，避免使用者誤以為設定有效。 */}
        {!autoOn && canSetHumidity && (
          <Field label="目標濕度">
            <Segment
              options={dh.humidity.map((h) => ({ value: h, label: `${h}%` }))}
              value={(() => {
                const t = String(device.targetHumidity ?? "").replace("%", "");
                const n = parseInt(t, 10);
                return Number.isFinite(n) ? n : undefined;
              })()}
              onSelect={(v) => sendDehumidifierCommand({ humidity: v })}
              pendingValue={dhPending?.type === "humidity" ? (dhPending.value as number) : undefined}
              failedValue={dhFailed?.type === "humidity" ? (dhFailed.value as number) : undefined}
              disabled={manualDisabled}
            />
          </Field>
        )}
        {autoOn && dehumRule && (
          <AutoModeChart
            sensorHistory={sensorsMap?.[dehumRule.sensor_name]?.history ?? []}
            onSegments={dehumHistoryToSegments(dehumHistoryMap?.[device.name]?.history ?? [])}
            humidityOnThreshold={dehumRule.humidity_on_threshold ?? dehumRule.threshold + 2}
            humidityOffThreshold={dehumRule.humidity_off_threshold ?? dehumRule.threshold - 1}
          />
        )}
      </>
    );
  }

  if (device.type === "IR") {
    const buttons = (device.buttons ?? "")
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    return (
      <Field label="遙控按鈕">
        <div className="flex flex-wrap gap-2">
          {buttons.map((btn) => {
            const isTap = irTap === btn;
            const isFailed = irFailed?.button === btn;
            // 配色語言對齊全站：fresh = 送出中、warm = 失敗。沒有「成功」狀態，
            // 因為 IR 沒有狀態 ground truth，HTTP 200 只代表 Hub 收到。
            const stateCls = isFailed
              ? "border-transparent bg-warm text-white animate-pulse"
              : isTap
              ? "border-transparent bg-fresh text-white scale-[0.97]"
              : "border-line bg-elevated text-soft hover:bg-mute/15 active:scale-[0.985]";
            return (
              <button
                key={btn}
                type="button"
                onClick={() => sendIrCommand(btn)}
                className={`inline-flex items-center justify-center rounded-full border px-3 py-[5px] text-sm font-medium leading-[20px] transition-all duration-150 ${stateCls}`}
              >
                {btn}
              </button>
            );
          })}
        </div>
        {irFailed ? (
          <p className="mt-2 text-xs text-warm">
            {irFailed.button}：{irFailed.message}
          </p>
        ) : (
          <p className="mt-2 text-xs text-mute">IR 為單向發送，不會回傳裝置狀態</p>
        )}
      </Field>
    );
  }

  return null;
}
