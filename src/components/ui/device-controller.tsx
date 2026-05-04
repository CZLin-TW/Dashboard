"use client";

import { useState } from "react";
import {
  type DeviceData,
  type DeviceOptions,
  type AcPendingState,
  acPendingFromDevice,
} from "@/lib/types";
import { Toggle2, Stepper, Segment, Field, StatusLine } from "./device-controls";

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
  /** AC 指令送出且輪詢確認 last 狀態到位後呼叫，由父層 refetch dashboard。
   *  失敗（10 秒沒匹配）也會呼叫，讓 UI 顯示最新真實狀態。 */
  onAcCommandSuccess?: () => Promise<void> | void;
  /** 除濕機指令送出且輪詢確認後呼叫，由父層 refetch /api/devices/status。
   *  失敗（10 秒沒匹配）也會呼叫。 */
  onDehumidifierCommandSuccess?: () => Promise<void> | void;
}

export function DeviceController({
  device,
  options,
  onAcCommandSuccess,
  onDehumidifierCommandSuccess,
}: Props) {
  const [pending, setPending] = useState<AcPendingState | null>(null);
  const [acFailed, setAcFailed] = useState(false);
  const [acAwaiting, setAcAwaiting] = useState(false);
  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);

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

      // AC 是 IR 單向、沒法回讀真實狀態。home-butler 寫回 Sheet 的 last_*
      // 當「已生效」訊號。10 秒內每秒輪詢 /api/dashboard，pending 跟
      // device.last* 匹配才清 pending、解鎖。OFF 時只比 power、ON 時四個
      // 欄位都要對齊。
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const r2 = await fetch("/api/dashboard");
          const data = await r2.json();
          const d: DeviceData | undefined = (data?.devices ?? []).find(
            (x: DeviceData) => x.name === device.name,
          );
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

  async function sendDehumidifierCommand(params: Record<string, unknown>) {
    // 推算這次操作期望的「最終狀態」，輪詢時用這個來判斷是否已生效
    const expected: { type: string; value: unknown } =
      params.power !== undefined ? { type: "power", value: params.power } :
      params.mode !== undefined ? { type: "mode", value: params.mode } :
      { type: "humidity", value: params.humidity };

    setDhPending(expected);
    setDhFailed(null);
    setSending(true);

    try {
      await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "dehumidifier", params }),
      });

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const res = await fetch("/api/devices/status");
          const data = await res.json();
          const dh = data?.[device.name];
          if (dh) {
            const matched =
              (expected.type === "power" && dh.power === expected.value) ||
              (expected.type === "mode" && dh.mode === expected.value) ||
              (expected.type === "humidity" && String(dh.targetHumidity) === `${expected.value}%`);
            if (matched) {
              setDhPending(null);
              if (onDehumidifierCommandSuccess) onDehumidifierCommandSuccess();
              return;
            }
          }
        } catch { /* continue polling */ }
      }

      // 10 秒後還沒匹配 → 標 failed 閃爍，仍 refetch 避免顯示與實際不一致
      setDhPending(null);
      setDhFailed(expected);
      setTimeout(() => setDhFailed(null), 2000);
      if (onDehumidifierCommandSuccess) onDehumidifierCommandSuccess();
    } finally {
      setSending(false);
    }
  }

  async function sendIrCommand(button: string) {
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "ir", params: { button } }),
      });
      if (!res.ok) {
        console.error(`[sendIrCommand] ${device.name}/${button} failed: HTTP ${res.status}`);
        alert(`IR 指令失敗：${device.name} - ${button}（HTTP ${res.status}）`);
      }
    } catch (err) {
      console.error(`[sendIrCommand] ${device.name}/${button} network error:`, err);
      alert(`IR 指令網路錯誤：${device.name} - ${button}`);
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
          className={`w-full rounded-full border py-2.5 text-sm font-semibold transition-colors ${
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
    return (
      <>
        {device.power !== undefined && (
          <StatusLine
            tone={device.power ? "running" : "off"}
            text={
              device.power
                ? `運轉中${device.mode ? ` · ${device.mode}` : ""}${device.targetHumidity ? ` · 目標 ${device.targetHumidity}` : ""}`
                : "關閉"
            }
          />
        )}
        <Field label="電源">
          <Toggle2
            value={!!device.power}
            onChange={(v) => sendDehumidifierCommand({ power: v })}
            disabled={dhPending !== null}
          />
        </Field>
        <Field label="模式">
          <Segment
            options={options.dehumidifier.modes}
            value={options.dehumidifier.modes.find((m) => m.label === device.mode)?.value}
            onSelect={(v) => sendDehumidifierCommand({ mode: v })}
            pendingValue={dhPending?.type === "mode" ? (dhPending.value as string) : undefined}
            failedValue={dhFailed?.type === "mode" ? (dhFailed.value as string) : undefined}
            disabled={dhPending !== null}
          />
        </Field>
        <Field label="目標濕度">
          <Segment
            options={options.dehumidifier.humidity.map((h) => ({ value: h, label: `${h}%` }))}
            value={(() => {
              const t = String(device.targetHumidity ?? "").replace("%", "");
              const n = parseInt(t, 10);
              return Number.isFinite(n) ? n : undefined;
            })()}
            onSelect={(v) => sendDehumidifierCommand({ humidity: v })}
            pendingValue={dhPending?.type === "humidity" ? (dhPending.value as number) : undefined}
            failedValue={dhFailed?.type === "humidity" ? (dhFailed.value as number) : undefined}
            disabled={dhPending !== null}
          />
        </Field>
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
          {buttons.map((btn) => (
            <button
              key={btn}
              type="button"
              onClick={() => sendIrCommand(btn)}
              className="rounded-full border border-line bg-elevated px-3 py-1.5 text-sm font-medium text-soft hover:bg-mute/15 active:scale-[0.985] transition"
            >
              {btn}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-mute">IR 為單向發送，不會回傳裝置狀態</p>
      </Field>
    );
  }

  return null;
}
