"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type DeviceData,
  type DeviceOptions,
  type AcPendingState,
  DEVICE_ICONS,
  acPendingFromDevice,
} from "./types";

interface Props {
  /** 已釘選且要顯示的可控設備（不含感應器）。順序依釘選順序。 */
  devices: DeviceData[];
  options: DeviceOptions;
  /** AC 指令送出成功後呼叫，由父層 refetch dashboard 取最新 last 狀態。 */
  onAcCommandSent: () => void;
  /** 除濕機指令送出且輪詢確認後呼叫，由父層 refetch /api/devices/status。 */
  onDehumidifierCommandSent: () => void;
}

/**
 * 首頁裝置快捷卡：每台釘選裝置一個 icon button，展開後在同一 row 內顯示控制面板。
 * 為什麼 expanded panel 要嵌進 grid 而不是浮層：保留視覺脈絡（哪個 button 對應哪個面板）。
 *
 * 內部狀態：
 *   expandedDevice  — 當前展開哪一台
 *   acPendingMap    — 每台 AC 還沒送出的草稿（電源/溫度/模式/風速）
 *   acDirtyMap      — 該草稿是否與 last 狀態有差異（決定「送出設定」按鈕亮綠色）
 *   acFailedMap     — 送出失敗的紅色閃爍 2 秒後自動清掉
 *   sending         — 全局送出中（避免使用者連點觸發多次）
 *   dhPending/Failed — 除濕機操作的 pending/failed 視覺反饋
 */
export function DeviceQuickControl({
  devices,
  options,
  onAcCommandSent,
  onDehumidifierCommandSent,
}: Props) {
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [acPendingMap, setAcPendingMap] = useState<Record<string, AcPendingState>>({});
  const [acDirtyMap, setAcDirtyMap] = useState<Record<string, boolean>>({});
  const [acFailedMap, setAcFailedMap] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);

  function toggleExpand(name: string) {
    setExpandedDevice((prev) => (prev === name ? null : name));
  }

  function getAcPending(device: DeviceData): AcPendingState {
    return acPendingMap[device.name] ?? acPendingFromDevice(device);
  }

  function updateAcPending(device: DeviceData, updates: Partial<AcPendingState>) {
    setAcPendingMap((prev) => {
      const current = prev[device.name] ?? acPendingFromDevice(device);
      return { ...prev, [device.name]: { ...current, ...updates } };
    });
    setAcDirtyMap((prev) => ({ ...prev, [device.name]: true }));
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

  async function sendAcCommand(device: DeviceData) {
    const pending = getAcPending(device);
    setSending(true);
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "setAll", params: pending }),
      });
      if (!res.ok) {
        console.error(`[sendAcCommand] ${device.name} failed: HTTP ${res.status}`);
        flashAcFailed(device.name);
        return;
      }
      // 成功：清掉草稿與 dirty 標記，讓 UI 重新讀 last 狀態
      setAcPendingMap((prev) => {
        const next = { ...prev };
        delete next[device.name];
        return next;
      });
      setAcDirtyMap((prev) => {
        const next = { ...prev };
        delete next[device.name];
        return next;
      });
      onAcCommandSent();
    } catch (err) {
      console.error(`[sendAcCommand] ${device.name} network error:`, err);
      flashAcFailed(device.name);
    } finally {
      setSending(false);
    }
  }

  async function sendDehumidifierCommand(deviceName: string, params: Record<string, unknown>) {
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
        body: JSON.stringify({ deviceName, action: "dehumidifier", params }),
      });

      // 除濕機的雲端狀態更新有延遲，10 秒內每秒輪詢一次
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

      // 10 秒後還沒匹配 → 標 failed 閃爍，但仍 refetch 避免顯示與實際不一致
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

  // ─── 渲染 helpers ───
  const isDhPending = (type: string, value: unknown) =>
    dhPending?.type === type && dhPending?.value === value;
  const isDhFailed = (type: string, value: unknown) =>
    dhFailed?.type === type && dhFailed?.value === value;

  /** 除濕機按鈕的 className：失敗閃紅、pending 閃黃、active 藍、其他灰。 */
  function dhBtnClass(type: string, value: unknown, isActive: boolean) {
    const base = "rounded px-2.5 py-1 text-xs font-medium transition-colors";
    if (isDhFailed(type, value)) return `${base} bg-red-500 text-white animate-pulse`;
    if (isDhPending(type, value)) return `${base} bg-amber-500 text-white animate-pulse`;
    if (isActive) return `${base} bg-blue-600 text-white`;
    return `${base} bg-gray-700 text-gray-300`;
  }

  function renderAcPanel(device: DeviceData) {
    const pending = getAcPending(device);
    const dirty = !!acDirtyMap[device.name];
    const failed = !!acFailedMap[device.name];
    const lastTime = device.lastUpdatedAt
      ? device.lastUpdatedAt.split(" ")[1] || device.lastUpdatedAt
      : "";

    return (
      <>
        {device.lastPower ? (
          <p className="text-xs text-gray-400">
            目前：
            {device.lastPower === "on" ? (
              <>
                🟢{" "}
                {device.lastTemperature !== undefined &&
                  device.lastTemperature !== "" &&
                  `${device.lastTemperature}°C`}
                {device.lastMode && ` ${device.lastMode}`}
                {device.lastFanSpeed && ` ${device.lastFanSpeed}`}
              </>
            ) : (
              "⚪ 關閉"
            )}
            {lastTime && ` · ${lastTime}`}
          </p>
        ) : (
          <p className="text-xs text-gray-500">尚無使用記錄</p>
        )}

        <div>
          <label className="text-xs text-gray-400">電源</label>
          <div className="mt-1 flex gap-2">
            <button
              onClick={() => updateAcPending(device, { power: true })}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                pending.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"
              }`}
            >
              ON
            </button>
            <button
              onClick={() => updateAcPending(device, { power: false })}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                !pending.power ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"
              }`}
            >
              OFF
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400">溫度</label>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() =>
                updateAcPending(device, {
                  temperature: Math.max(options.ac.temperature.min, pending.temperature - 1),
                })
              }
              className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-sm"
            >
              −
            </button>
            <span className="w-14 text-center font-bold">{pending.temperature}°C</span>
            <button
              onClick={() =>
                updateAcPending(device, {
                  temperature: Math.min(options.ac.temperature.max, pending.temperature + 1),
                })
              }
              className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-sm"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400">模式</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.ac.modes.map((m) => (
              <button
                key={m.value}
                onClick={() => updateAcPending(device, { mode: m.value })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  pending.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400">風速</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.ac.fan_speeds.map((s) => (
              <button
                key={s.value}
                onClick={() => updateAcPending(device, { fanSpeed: s.value })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  pending.fanSpeed === s.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => sendAcCommand(device)}
          disabled={sending}
          className={`w-full rounded-lg py-2 text-sm font-bold transition-colors ${
            failed
              ? "bg-red-500 text-white animate-pulse"
              : dirty
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-700 text-gray-400"
          }`}
        >
          {failed ? "失敗，請重試" : sending ? "送出中..." : dirty ? "送出設定" : "未變更"}
        </button>
      </>
    );
  }

  function renderDehumidifierPanel(device: DeviceData) {
    return (
      <>
        <div>
          {device.power !== undefined && (
            <p className="text-xs text-gray-400">
              目前：{device.power ? "🟢 運轉中" : "⚪ 關閉"}
              {device.mode && ` · ${device.mode}`}
              {device.targetHumidity && ` · ${device.targetHumidity}`}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-gray-400">電源</label>
          <div className="mt-1 flex gap-2">
            <button
              onClick={() => sendDehumidifierCommand(device.name, { power: true })}
              disabled={sending}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                isDhFailed("power", true)
                  ? "bg-red-500 text-white animate-pulse"
                  : isDhPending("power", true)
                  ? "bg-amber-500 text-white animate-pulse"
                  : device.power
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              ON
            </button>
            <button
              onClick={() => sendDehumidifierCommand(device.name, { power: false })}
              disabled={sending}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                isDhFailed("power", false)
                  ? "bg-red-500 text-white animate-pulse"
                  : isDhPending("power", false)
                  ? "bg-amber-500 text-white animate-pulse"
                  : device.power === false
                  ? "bg-red-600 text-white"
                  : "bg-gray-700 text-gray-300"
              }`}
            >
              OFF
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">模式</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.dehumidifier.modes.map((m) => (
              <button
                key={m.value}
                onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })}
                disabled={sending}
                className={dhBtnClass("mode", m.value, device.mode === m.label)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">目標濕度</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {options.dehumidifier.humidity.map((h) => (
              <button
                key={h}
                onClick={() => sendDehumidifierCommand(device.name, { humidity: h })}
                disabled={sending}
                className={dhBtnClass("humidity", h, String(device.targetHumidity) === `${h}%`)}
              >
                {h}%
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  function renderIrPanel(device: DeviceData) {
    const buttons = (device.buttons ?? "")
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    return (
      <div>
        <label className="text-xs text-gray-400">遙控按鈕</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {buttons.map((btn) => (
            <button
              key={btn}
              onClick={() => sendIrCommand(device.name, btn)}
              className="rounded-lg bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors"
            >
              {btn}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">IR 單向發送，不會回傳狀態</p>
      </div>
    );
  }

  function renderPanel(device: DeviceData) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">
            {DEVICE_ICONS[device.type]} {device.name}
            {device.location && (
              <span className="ml-2 text-xs font-normal text-gray-500">{device.location}</span>
            )}
          </h3>
          <button
            onClick={() => setExpandedDevice(null)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            收合 ▲
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
          <CardTitle>📱 裝置快捷</CardTitle>
          <Link href="/devices" className="text-sm text-blue-400 hover:text-blue-300">
            查看全部 →
          </Link>
        </CardHeader>
        <p className="text-sm text-gray-500">
          請到
          <Link href="/devices" className="text-blue-400 hover:text-blue-300 mx-1">裝置頁</Link>
          📌 釘選裝置
        </p>
      </Card>
    );
  }

  // 展開的設備位置：用來把面板插在「該 row 的最後一格之後」，視覺上展開的卡會推開下方
  const expandedDev = expandedDevice ? devices.find((d) => d.name === expandedDevice) : null;
  const expandedIdx = expandedDev ? devices.indexOf(expandedDev) : -1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>📱 裝置快捷</CardTitle>
        <Link href="/devices" className="text-sm text-blue-400 hover:text-blue-300">
          查看全部 →
        </Link>
      </CardHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {devices.map((device, index) => {
          // 手機 2 欄、桌面 4 欄。展開面板要插在「展開的卡所在那一 row 的最後」
          const isLastInMobileRow = index % 2 === 1 || index === devices.length - 1;
          const isLastInDesktopRow = index % 4 === 3 || index === devices.length - 1;
          const mobileRowStart = Math.floor(index / 2) * 2;
          const desktopRowStart = Math.floor(index / 4) * 4;
          const showMobilePanel =
            isLastInMobileRow &&
            expandedIdx >= mobileRowStart &&
            expandedIdx < mobileRowStart + 2 &&
            expandedDev;
          const showDesktopPanel =
            isLastInDesktopRow &&
            expandedIdx >= desktopRowStart &&
            expandedIdx < desktopRowStart + 4 &&
            expandedDev;

          // 運作中燈號：空調看 lastPower（IR 不能回讀），除濕機看 power（雲端真實狀態）
          const isRunning =
            (device.type === "空調" && device.lastPower === "on") ||
            (device.type === "除濕機" && device.power === true);

          return (
            <React.Fragment key={device.name}>
              <button
                onClick={() => toggleExpand(device.name)}
                className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                  expandedDevice === device.name
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                }`}
              >
                {isRunning && (
                  <span
                    aria-label="運作中"
                    className="absolute top-2 left-2 flex h-2.5 w-2.5"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e]" />
                  </span>
                )}
                <span className="text-2xl">{DEVICE_ICONS[device.type] ?? "📱"}</span>
                <span className="text-sm font-medium">{device.name}</span>
                {device.location && (
                  <span className="text-xs text-gray-500">{device.location}</span>
                )}
              </button>
              {showMobilePanel && (
                <div className="col-span-2 sm:hidden">{renderPanel(expandedDev!)}</div>
              )}
              {showDesktopPanel && (
                <div className="hidden sm:block sm:col-span-4">{renderPanel(expandedDev!)}</div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </Card>
  );
}
