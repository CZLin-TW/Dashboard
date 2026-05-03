"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { LayoutGrid, ChevronUp, Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Toggle2,
  Stepper,
  Segment,
  Field,
  StatusLine,
  PANEL_BASE,
} from "@/components/ui/device-controls";
import {
  type DeviceData,
  type DeviceOptions,
  type AcPendingState,
  DEVICE_ICONS,
  DEVICE_ICON_FALLBACK,
  acPendingFromDevice,
} from "./types";

// Tile 用的 accent：active 邊框/底色漸層、icon 顏色與光暈。
// 跟裝置頁的 panel 視覺刻意不同——首頁 tile 是「快捷入口」、需要色相區分設備類型；裝置頁 panel 是「可控介面」、要安靜。
type Accent = { iconClass: string; activeBorder: string; activeBg: string };
const DEVICE_ACCENT: Record<string, Accent> = {
  // 空調：深藍 #3A6289（cooling）
  "空調":   { iconClass: "text-[#8EA6B2] drop-shadow-[0_0_10px_rgba(58,98,137,0.55)]",  activeBorder: "border-[#3A6289]/60",  activeBg: "from-[#3A6289]/35 to-surface" },
  // 除濕機：鼠尾草 #3C977D（fresh / water）
  "除濕機": { iconClass: "text-[#3C977D] drop-shadow-[0_0_10px_rgba(60,152,125,0.55)]", activeBorder: "border-[#3C977D]/60", activeBg: "from-[#3C977D]/30 to-surface" },
  // IR：珊瑚 #DF766E（warm / energy）
  "IR":     { iconClass: "text-[#DF766E] drop-shadow-[0_0_10px_rgba(223,118,110,0.55)]", activeBorder: "border-[#DF766E]/60", activeBg: "from-[#DF766E]/25 to-surface" },
};
const DEFAULT_ACCENT: Accent = { iconClass: "text-[#C5C5CA]", activeBorder: "border-[#8EA6B2]/50", activeBg: "from-[#8EA6B2]/20 to-surface" };

interface Props {
  /** 已釘選且要顯示的可控設備（不含感應器）。順序依釘選順序。 */
  devices: DeviceData[];
  options: DeviceOptions;
  /** AC 指令送出成功後呼叫，由父層 refetch dashboard 取最新 last 狀態。回傳 Promise 讓本層能 await 確保 prop 已更新後再清 pending。 */
  onAcCommandSent: () => Promise<void> | void;
  /** 除濕機指令送出且輪詢確認後呼叫，由父層 refetch /api/devices/status。 */
  onDehumidifierCommandSent: () => Promise<void> | void;
}

/**
 * 首頁裝置快捷卡：每台釘選裝置一個 icon button，展開後在同一 row 內顯示控制面板。
 * 為什麼 expanded panel 要嵌進 grid 而不是浮層：保留視覺脈絡（哪個 button 對應哪個面板）。
 *
 * Panel 內部的 Toggle2 / Stepper / Segment / StatusLine 都用 src/components/ui/device-controls
 * 的共用元件，跟裝置頁、排程頁視覺一致。
 *
 * 內部狀態：
 *   expandedDevice  — 當前展開哪一台
 *   acPendingMap    — 每台 AC 還沒送出的草稿（電源/溫度/模式/風速）
 *   acFailedMap     — 送出失敗的紅色閃爍 2 秒後自動清掉
 *   acAwaitingMap   — 已送出、等待 last 狀態回讀的 amber 閃爍
 *   sending         — 全局送出中（避免使用者連點觸發多次）
 *   dhPending/Failed — 除濕機操作的 pending/failed 視覺反饋
 *
 * dirty（決定送出設定 vs 未變更）改成衍生值：比對 pending 與 device.last*
 *   實際是否不同，這樣 A→B→A 改回原值會回到「未變更」。
 */
export function DeviceQuickControl({
  devices,
  options,
  onAcCommandSent,
  onDehumidifierCommandSent,
}: Props) {
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [acPendingMap, setAcPendingMap] = useState<Record<string, AcPendingState>>({});
  const [acFailedMap, setAcFailedMap] = useState<Record<string, boolean>>({});
  const [acAwaitingMap, setAcAwaitingMap] = useState<Record<string, AcPendingState>>({});
  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);

  function toggleExpand(name: string) {
    setExpandedDevice((prev) => (prev === name ? null : name));
  }

  function getAcPending(device: DeviceData): AcPendingState {
    return acPendingMap[device.name] ?? acPendingFromDevice(device);
  }

  function isAcDirty(device: DeviceData): boolean {
    const pending = getAcPending(device);
    const baseline = acPendingFromDevice(device);
    if (pending.power !== baseline.power) return true;
    if (!pending.power) return false;
    return (
      pending.temperature !== baseline.temperature ||
      pending.mode !== baseline.mode ||
      pending.fanSpeed !== baseline.fanSpeed
    );
  }

  function updateAcPending(device: DeviceData, updates: Partial<AcPendingState>) {
    setAcPendingMap((prev) => {
      const current = prev[device.name] ?? acPendingFromDevice(device);
      return { ...prev, [device.name]: { ...current, ...updates } };
    });
  }

  function flashAcFailed(deviceName: string) {
    setAcFailedMap((prev) => ({ ...prev, [deviceName]: true }));
    setTimeout(() => {
      setAcFailedMap((prev) => {
        const next = { ...prev };
        delete next[deviceName];
        return next;
      });
    }, 2000);
  }

  function clearAcAwaiting(deviceName: string) {
    setAcAwaitingMap((prev) => {
      const next = { ...prev };
      delete next[deviceName];
      return next;
    });
  }

  async function sendAcCommand(device: DeviceData) {
    const pending = getAcPending(device);
    setAcAwaitingMap((prev) => ({ ...prev, [device.name]: pending }));
    setSending(true);
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "setAll", params: pending }),
      });
      if (!res.ok) {
        console.error(`[sendAcCommand] ${device.name} failed: HTTP ${res.status}`);
        clearAcAwaiting(device.name);
        flashAcFailed(device.name);
        return;
      }

      // AC 是 IR 單向，沒有真實狀態回讀；改用 home-butler 寫回 Sheet 的 last* 快照當「已生效」訊號。
      // 10 秒內每秒輪詢 /api/dashboard，pending 跟 device.last* 匹配才清 pending、解鎖 sending。
      // 期間 sending=true → 整張卡的送出按鈕都被 disable，避免兩次連發 race。
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
            // OFF 時 home-butler 可能不寫其他欄位，只比對 power；ON 時四個欄位都要對齊。
            const matched = pending.power
              ? d.lastPower === "on" &&
                tempNum === pending.temperature &&
                (d.lastMode || "") === pending.mode &&
                (d.lastFanSpeed || "") === pending.fanSpeed
              : d.lastPower === "off";
            if (matched) {
              // 先 await parent refetch，確保 device prop 已經帶到新 last 狀態，再清 pending；
              // React 18 自動 batch，下一輪 render 同時看到新 prop + 清空的 pending，避免 flicker。
              await onAcCommandSent();
              setAcPendingMap((prev) => {
                const next = { ...prev };
                delete next[device.name];
                return next;
              });
              clearAcAwaiting(device.name);
              return;
            }
          }
        } catch {
          /* continue polling */
        }
      }

      // 10 秒沒匹配 → 失敗閃紅；仍 refetch 一次避免 UI 跟實際長期不一致
      clearAcAwaiting(device.name);
      flashAcFailed(device.name);
      onAcCommandSent();
    } catch (err) {
      console.error(`[sendAcCommand] ${device.name} network error:`, err);
      clearAcAwaiting(device.name);
      flashAcFailed(device.name);
    } finally {
      setSending(false);
    }
  }

  async function sendDehumidifierCommand(deviceName: string, params: Record<string, unknown>) {
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
        body: JSON.stringify({ deviceName, action: "dehumidifier", params }),
      });

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const res = await fetch("/api/devices/status");
          const data = await res.json();
          const dh = data?.[deviceName];
          if (dh) {
            const matched =
              (expected.type === "power" && dh.power === expected.value) ||
              (expected.type === "mode" && dh.mode === expected.value) ||
              (expected.type === "humidity" && String(dh.targetHumidity) === `${expected.value}%`);
            if (matched) {
              setDhPending(null);
              onDehumidifierCommandSent();
              return;
            }
          }
        } catch {
          /* continue polling */
        }
      }

      setDhPending(null);
      setDhFailed(expected);
      setTimeout(() => setDhFailed(null), 2000);
      onDehumidifierCommandSent();
    } finally {
      setSending(false);
    }
  }

  async function sendIrCommand(deviceName: string, button: string) {
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, action: "ir", params: { button } }),
      });
      if (!res.ok) {
        console.error(`[sendIrCommand] ${deviceName}/${button} failed: HTTP ${res.status}`);
        alert(`IR 指令失敗：${deviceName} - ${button}（HTTP ${res.status}）`);
      }
    } catch (err) {
      console.error(`[sendIrCommand] ${deviceName}/${button} network error:`, err);
      alert(`IR 指令網路錯誤：${deviceName} - ${button}`);
    }
  }

  function renderAcPanel(device: DeviceData) {
    const pending = getAcPending(device);
    const dirty = isAcDirty(device);
    const failed = !!acFailedMap[device.name];
    const awaiting = !!acAwaitingMap[device.name];
    const lastTime = device.lastUpdatedAt
      ? device.lastUpdatedAt.split(" ")[1] || device.lastUpdatedAt
      : undefined;

    return (
      <>
        {device.lastPower || awaiting ? (
          <StatusLine
            tone={awaiting ? "waiting" : device.lastPower === "on" ? "running" : "off"}
            text={
              awaiting
                ? pending.power
                  ? `送出中：${pending.temperature}°C ${pending.mode} ${pending.fanSpeed}`.trim()
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
          <Toggle2 value={pending.power} onChange={(v) => updateAcPending(device, { power: v })} />
        </Field>

        <Field label="溫度">
          <Stepper
            value={pending.temperature}
            onMinus={() => updateAcPending(device, { temperature: Math.max(options.ac.temperature.min, pending.temperature - 1) })}
            onPlus={() => updateAcPending(device, { temperature: Math.min(options.ac.temperature.max, pending.temperature + 1) })}
          />
        </Field>

        <Field label="模式">
          <Segment
            options={options.ac.modes}
            value={pending.mode}
            onSelect={(v) => updateAcPending(device, { mode: v })}
          />
        </Field>

        <Field label="風速">
          <Segment
            options={options.ac.fan_speeds}
            value={pending.fanSpeed}
            onSelect={(v) => updateAcPending(device, { fanSpeed: v })}
          />
        </Field>

        <button
          type="button"
          onClick={() => sendAcCommand(device)}
          disabled={sending || awaiting}
          className={`w-full rounded-full border py-2.5 text-sm font-semibold transition-colors ${
            failed
              ? "border-transparent bg-warm text-white animate-pulse"
              : awaiting
              ? "border-transparent bg-amber-500 text-white animate-pulse"
              : dirty
              ? "border-transparent bg-fresh text-white hover:bg-fresh/85"
              : "border-dashed border-line-strong bg-elevated text-mute"
          }`}
        >
          {failed
            ? "失敗，請重試"
            : sending
            ? "送出中..."
            : awaiting
            ? "確認中..."
            : dirty
            ? "送出設定"
            : "未變更"}
        </button>
      </>
    );
  }

  function renderDehumidifierPanel(device: DeviceData) {
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
            onChange={(v) => sendDehumidifierCommand(device.name, { power: v })}
            disabled={dhPending !== null}
          />
        </Field>
        <Field label="模式">
          <Segment
            options={options.dehumidifier.modes}
            value={options.dehumidifier.modes.find(m => m.label === device.mode)?.value}
            onSelect={(v) => sendDehumidifierCommand(device.name, { mode: v })}
            pendingValue={dhPending?.type === "mode" ? (dhPending.value as string) : undefined}
            failedValue={dhFailed?.type === "mode" ? (dhFailed.value as string) : undefined}
            disabled={dhPending !== null}
          />
        </Field>
        <Field label="目標濕度">
          <Segment
            options={options.dehumidifier.humidity.map(h => ({ value: h, label: `${h}%` }))}
            value={(() => {
              const t = String(device.targetHumidity ?? "").replace("%", "");
              const n = parseInt(t, 10);
              return Number.isFinite(n) ? n : undefined;
            })()}
            onSelect={(v) => sendDehumidifierCommand(device.name, { humidity: v })}
            pendingValue={dhPending?.type === "humidity" ? (dhPending.value as number) : undefined}
            failedValue={dhFailed?.type === "humidity" ? (dhFailed.value as number) : undefined}
            disabled={dhPending !== null}
          />
        </Field>
      </>
    );
  }

  function renderIrPanel(device: DeviceData) {
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
              onClick={() => sendIrCommand(device.name, btn)}
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

  function renderPanel(device: DeviceData) {
    const Icon = DEVICE_ICONS[device.type] ?? DEVICE_ICON_FALLBACK;
    return (
      <div className={PANEL_BASE}>
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-4 w-4 place-items-center text-mute">
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{device.name}</span>
            {device.location && (
              <span className="text-xs text-mute">{device.location}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpandedDevice(null)}
            className="flex items-center gap-1 rounded-full border border-line bg-elevated px-2.5 py-1 text-xs text-mute hover:text-soft"
          >
            收合
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        {device.type === "空調" && renderAcPanel(device)}
        {device.type === "除濕機" && renderDehumidifierPanel(device)}
        {device.type === "IR" && renderIrPanel(device)}
      </div>
    );
  }

  // ─── 主渲染 ───
  if (devices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <LayoutGrid className="h-4 w-4" strokeWidth={2} />
            裝置快捷
          </CardTitle>
          <Link href="/devices" className="text-sm text-cool hover:text-cool/80">
            查看全部 →
          </Link>
        </CardHeader>
        <p className="flex items-center gap-1 text-sm text-mute">
          請到
          <Link href="/devices" className="text-cool hover:text-cool/80 mx-1">裝置頁</Link>
          <Pin className="h-3.5 w-3.5" strokeWidth={2} />
          釘選裝置
        </p>
      </Card>
    );
  }

  const expandedDev = expandedDevice ? devices.find((d) => d.name === expandedDevice) : null;

  function renderTile(device: DeviceData) {
    const isRunning =
      (device.type === "空調" && device.lastPower === "on") ||
      (device.type === "除濕機" && device.power === true);
    const isActive = expandedDevice === device.name;
    const accent = DEVICE_ACCENT[device.type] ?? DEFAULT_ACCENT;
    const Icon = DEVICE_ICONS[device.type] ?? DEVICE_ICON_FALLBACK;
    return (
      <motion.button
        key={device.name}
        onClick={() => toggleExpand(device.name)}
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 bg-gradient-to-br shadow-sm shadow-mute/10 transition-colors duration-200 ${
          isActive
            ? `${accent.activeBorder} ${accent.activeBg}`
            : "border-mute/15 from-elevated to-surface hover:from-elevated/85 hover:to-surface/85"
        }`}
      >
        {isRunning && (
          <span aria-label="運作中" className="absolute top-2 left-2 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          </span>
        )}
        <Icon className={`h-7 w-7 ${accent.iconClass}`} strokeWidth={1.75} />
        <span className="text-sm font-medium">{device.name}</span>
        {device.location && <span className="text-xs text-mute">{device.location}</span>}
      </motion.button>
    );
  }

  // Panel 必須跟「展開設備那一 row」相鄰才有正確視覺脈絡。
  // 但 mobile（2 欄）跟 desktop（4 欄）的 row 拆法不同 → 兩套各自渲染。
  // panel 放在每組 row 的後面（grid 外），避免 CSS grid `gap` 在 height: 0 ↔ unmount 時造成 12px snap。
  function renderRows(cols: 2 | 4, viewportClass: string) {
    const rows: DeviceData[][] = [];
    for (let i = 0; i < devices.length; i += cols) rows.push(devices.slice(i, i + cols));
    const gridCols = cols === 2 ? "grid-cols-2" : "grid-cols-4";
    return (
      <div className={`${viewportClass} space-y-3`}>
        {rows.map((row, rowIdx) => {
          const rowHasExpanded = !!expandedDev && row.some((d) => d.name === expandedDev.name);
          return (
            <div key={rowIdx}>
              <div className={`grid ${gridCols} gap-3`}>{row.map(renderTile)}</div>
              <AnimatePresence initial={false}>
                {rowHasExpanded && expandedDev && (
                  <motion.div
                    key="panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      height: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
                      opacity: { duration: 0.18, ease: "easeOut" },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3">{renderPanel(expandedDev)}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <LayoutGrid className="h-4 w-4" strokeWidth={2} />
          裝置快捷
        </CardTitle>
        <Link href="/devices" className="text-sm text-cool hover:text-cool/80">
          查看全部 →
        </Link>
      </CardHeader>
      {renderRows(2, "sm:hidden")}
      {renderRows(4, "hidden sm:block")}
    </Card>
  );
}
