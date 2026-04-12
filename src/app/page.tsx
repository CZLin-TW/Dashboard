"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import { useState } from "react";

interface WeatherData {
  location: string;
  city: string;
  date_label: string;
  date: string;
  wx: string;
  min_t: number | null;
  max_t: number | null;
  min_at: number | null;
  max_at: number | null;
  pop: number | null;
}

interface DeviceData {
  name: string;
  type: string;
  location?: string;
  temperature?: number;
  humidity?: number;
  power?: boolean;
  mode?: string;
  targetHumidity?: string;
  buttons?: string;
  lastPower?: string;
  lastTemperature?: number | string;
  lastMode?: string;
  lastFanSpeed?: string;
  lastUpdatedAt?: string;
}

interface AcPendingState {
  power: boolean;
  temperature: number;
  mode: string;
  fanSpeed: string;
}

function acPendingFromDevice(device: DeviceData): AcPendingState {
  const raw = device.lastTemperature;
  const tempNum =
    typeof raw === "number" ? raw :
    typeof raw === "string" && raw.trim() !== "" ? parseInt(raw, 10) : NaN;
  return {
    power: device.lastPower === "on",
    temperature: Number.isFinite(tempNum) ? tempNum : 26,
    mode: device.lastMode || "",
    fanSpeed: device.lastFanSpeed || "",
  };
}

interface DeviceOptions {
  ac: {
    modes: Array<{ value: string; label: string }>;
    fan_speeds: Array<{ value: string; label: string }>;
    temperature: { min: number; max: number };
  };
  dehumidifier: {
    modes: Array<{ value: string; label: string }>;
    humidity: number[];
  };
}

interface TodoData {
  "事項": string;
  "日期": string;
  "時間": string;
  "負責人": string;
  "狀態": string;
}

interface FoodData {
  "品名": string;
  "數量": string;
  "單位": string;
  "過期日": string;
}

function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const DEFAULT_OPTIONS: DeviceOptions = {
  ac: { modes: [], fan_speeds: [], temperature: { min: 16, max: 30 } },
  dehumidifier: { modes: [], humidity: [] },
};

export default function HomePage() {
  const { currentUser } = useUser();

  // Single API call for all home page data
  interface DashboardData {
    weatherToday: WeatherData | null;
    weatherTomorrow: WeatherData | null;
    devices: DeviceData[];
    todos: TodoData[];
    food: FoodData[];
    options: DeviceOptions;
  }
  const { data: dashboard, refetch: refetchDashboard } = useCachedFetch<DashboardData | null>("/api/dashboard", null);
  const { data: liveStatus } = useCachedFetch<Record<string, Partial<DeviceData>>>("/api/devices/status", {});

  const weatherToday = dashboard?.weatherToday ?? null;
  const weatherTomorrow = dashboard?.weatherTomorrow ?? null;
  const todayHasData = weatherToday && !("error" in weatherToday) && weatherToday.max_t !== null;
  const weather = todayHasData ? weatherToday : weatherTomorrow;
  const devices = (Array.isArray(dashboard?.devices) ? dashboard.devices : []).map(d => ({ ...d, ...(liveStatus[d.name] ?? {}) }));
  const todos = Array.isArray(dashboard?.todos) ? dashboard.todos : [];
  const food = Array.isArray(dashboard?.food) ? dashboard.food : [];
  const options = dashboard?.options ?? DEFAULT_OPTIONS;
  const refetchDevices = refetchDashboard;
  const refetchTodos = refetchDashboard;
  const pin = usePinnedDevices();

  const allDevices = devices;

  // Home page: only show pinned items, ordered by pin sequence
  const pinnedSensor = pin.pinnedSensor ? allDevices.find(d => d.name === pin.pinnedSensor) : null;
  const controllableDevices = pin.pinnedDevices
    .map(name => allDevices.find(d => d.name === name))
    .filter((d): d is DeviceData => d !== undefined && d.type !== "感應器");
  const myTodos = todos.filter(t =>
    t["狀態"] === "待辦" && (
      !currentUser || t["負責人"] === currentUser.name ||
      t["負責人"] === currentUser.name.substring(0, 2)
    )
  ).sort((a, b) => {
    const dateA = `${a["日期"]} ${a["時間"] || "99:99"}`;
    const dateB = `${b["日期"]} ${b["時間"] || "99:99"}`;
    return dateA.localeCompare(dateB);
  }).slice(0, 5);

  const urgentFood = food.filter(f => {
    const days = daysUntilExpiry(f["過期日"]);
    return days >= 0 && days <= 3;
  });

  const deviceIcons: Record<string, string> = {
    "空調": "❄️", "IR": "🌀", "除濕機": "💨",
  };

  // Expanded device control
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [acPendingMap, setAcPendingMap] = useState<Record<string, AcPendingState>>({});
  const [acDirtyMap, setAcDirtyMap] = useState<Record<string, boolean>>({});
  const [acFailedMap, setAcFailedMap] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const [completingItems, setCompletingItems] = useState<Set<string>>(new Set());

  function toggleExpand(name: string) {
    setExpandedDevice(prev => prev === name ? null : name);
  }

  function getAcPending(device: DeviceData): AcPendingState {
    return acPendingMap[device.name] ?? acPendingFromDevice(device);
  }

  function updateAcPending(device: DeviceData, updates: Partial<AcPendingState>) {
    setAcPendingMap(prev => {
      const current = prev[device.name] ?? acPendingFromDevice(device);
      return { ...prev, [device.name]: { ...current, ...updates } };
    });
    setAcDirtyMap(prev => ({ ...prev, [device.name]: true }));
  }

  function flashAcFailed(deviceName: string) {
    setAcFailedMap(prev => ({ ...prev, [deviceName]: true }));
    setTimeout(() => {
      setAcFailedMap(prev => { const next = { ...prev }; delete next[deviceName]; return next; });
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
      setAcPendingMap(prev => { const next = { ...prev }; delete next[device.name]; return next; });
      setAcDirtyMap(prev => { const next = { ...prev }; delete next[device.name]; return next; });
      refetchDevices();
    } catch (err) {
      console.error(`[sendAcCommand] ${device.name} network error:`, err);
      flashAcFailed(device.name);
    } finally { setSending(false); }
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
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch("/api/devices");
          const data = await res.json();
          if (Array.isArray(data)) {
            const dh = data.find((d: DeviceData) => d.name === deviceName);
            if (dh) {
              const matched =
                (expected.type === "power" && dh.power === expected.value) ||
                (expected.type === "mode" && dh.mode === expected.value) ||
                (expected.type === "humidity" && dh.targetHumidity === expected.value);
              if (matched) {
                setDhPending(null);
                refetchDevices();
                return;
              }
            }
          }
        } catch { /* continue polling */ }
      }

      setDhPending(null);
      setDhFailed(expected);
      setTimeout(() => setDhFailed(null), 2000);
      refetchDevices();
    } finally { setSending(false); }
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

  function completeTodo(item: string) {
    setCompletingItems(prev => new Set(prev).add(item));
    fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setTimeout(() => {
          setCompletingItems(prev => { const next = new Set(prev); next.delete(item); return next; });
          refetchTodos();
        }, 500);
      })
      .catch(err => {
        console.error(`[completeTodo] ${item} failed:`, err);
        // Revert the optimistic UI so the item reappears in the list.
        setCompletingItems(prev => { const next = new Set(prev); next.delete(item); return next; });
        alert(`完成失敗：${item}（${err instanceof Error ? err.message : "請稍後再試"}）`);
      });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Weather */}
      <Card>
        <CardHeader>
          <CardTitle>🌤️ 天氣{weather?.date_label && !todayHasData ? `（${weather.date_label}）` : ""}</CardTitle>
        </CardHeader>
        {weather && !("error" in weather) && weather.max_t !== null ? (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">{weather.max_t}°C</span>
              <span className="text-gray-400">{weather.wx}</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              📍 {weather.city}{weather.location} · {weather.min_t}~{weather.max_t}°C
              {weather.pop !== null && ` · 降雨 ${weather.pop}%`}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">載入中...</p>
        )}
      </Card>

      {/* Indoor Sensor (pinned) */}
      <Card>
        <CardHeader>
          <CardTitle>🌡️ 室內環境</CardTitle>
        </CardHeader>
        {pinnedSensor ? (
          <>
            <div className="flex items-baseline gap-6">
              <div><span className="text-3xl font-bold">{pinnedSensor.temperature}°C</span></div>
              <div><span className="text-3xl font-bold">{pinnedSensor.humidity}%</span><span className="ml-1 text-sm text-gray-400">濕度</span></div>
            </div>
            <p className="mt-1 text-sm text-gray-500">{pinnedSensor.location || pinnedSensor.name}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">請到<Link href="/devices" className="text-blue-400 hover:text-blue-300 mx-1">裝置頁</Link>📌 釘選一個感測器</p>
        )}
      </Card>

      {/* Devices Quick Control */}
      <Card>
        <CardHeader>
          <CardTitle>📱 裝置快捷</CardTitle>
          <Link href="/devices" className="text-sm text-blue-400 hover:text-blue-300">
            查看全部 →
          </Link>
        </CardHeader>
        {controllableDevices.length === 0 ? (
          <p className="text-sm text-gray-500">請到<Link href="/devices" className="text-blue-400 hover:text-blue-300 mx-1">裝置頁</Link>📌 釘選裝置</p>
        ) : (<>
        {(() => {
          const isPending = (type: string, value: unknown) => dhPending?.type === type && dhPending?.value === value;
          const isFailed = (type: string, value: unknown) => dhFailed?.type === type && dhFailed?.value === value;
          const btnClass = (type: string, value: unknown, isActive: boolean) =>
            `rounded px-2.5 py-1 text-xs font-medium transition-colors ${isFailed(type, value) ? "bg-red-500 text-white animate-pulse" : isPending(type, value) ? "bg-amber-500 text-white animate-pulse" : isActive ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`;

          const renderPanel = (device: DeviceData, colSpanClass: string) => (
            <div key={`panel-${device.name}`} className={`${colSpanClass} rounded-lg border border-gray-700 bg-gray-800/30 p-4 space-y-4`}>
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-200">{deviceIcons[device.type]} {device.name}{device.location && <span className="ml-2 text-xs font-normal text-gray-500">{device.location}</span>}</h3><button onClick={() => setExpandedDevice(null)} className="text-xs text-gray-500 hover:text-gray-300">收合 ▲</button></div>
              {device.type === "空調" && (() => {
                const pending = getAcPending(device);
                const dirty = !!acDirtyMap[device.name];
                const failed = !!acFailedMap[device.name];
                const lastTime = device.lastUpdatedAt ? (device.lastUpdatedAt.split(" ")[1] || device.lastUpdatedAt) : "";
                return (<>
                  {device.lastPower ? (
                    <p className="text-xs text-gray-400">目前：{device.lastPower === "on" ? (<>🟢 {device.lastTemperature !== undefined && device.lastTemperature !== "" && `${device.lastTemperature}°C`}{device.lastMode && ` ${device.lastMode}`}{device.lastFanSpeed && ` ${device.lastFanSpeed}`}</>) : "⚪ 關閉"}{lastTime && ` · ${lastTime}`}</p>
                  ) : (
                    <p className="text-xs text-gray-500">尚無使用記錄</p>
                  )}
                  <div><label className="text-xs text-gray-400">電源</label><div className="mt-1 flex gap-2"><button onClick={() => updateAcPending(device, { power: true })} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${pending.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>ON</button><button onClick={() => updateAcPending(device, { power: false })} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${!pending.power ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}>OFF</button></div></div><div><label className="text-xs text-gray-400">溫度</label><div className="mt-1 flex items-center gap-2"><button onClick={() => updateAcPending(device, { temperature: Math.max(options.ac.temperature.min, pending.temperature - 1) })} className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-sm">−</button><span className="w-14 text-center font-bold">{pending.temperature}°C</span><button onClick={() => updateAcPending(device, { temperature: Math.min(options.ac.temperature.max, pending.temperature + 1) })} className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-sm">+</button></div></div><div><label className="text-xs text-gray-400">模式</label><div className="mt-1 flex flex-wrap gap-1.5">{options.ac.modes.map(m => (<button key={m.value} onClick={() => updateAcPending(device, { mode: m.value })} className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${pending.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{m.label}</button>))}</div></div><div><label className="text-xs text-gray-400">風速</label><div className="mt-1 flex flex-wrap gap-1.5">{options.ac.fan_speeds.map(s => (<button key={s.value} onClick={() => updateAcPending(device, { fanSpeed: s.value })} className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${pending.fanSpeed === s.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{s.label}</button>))}</div></div><button onClick={() => sendAcCommand(device)} disabled={sending} className={`w-full rounded-lg py-2 text-sm font-bold transition-colors ${failed ? "bg-red-500 text-white animate-pulse" : dirty ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-700 text-gray-400"}`}>{failed ? "失敗，請重試" : sending ? "送出中..." : dirty ? "送出設定" : "未變更"}</button>
                </>);
              })()}
              {device.type === "除濕機" && (<><div>{device.power !== undefined && (<p className="text-xs text-gray-400">目前：{device.power ? "🟢 運轉中" : "⚪ 關閉"}{device.mode && ` · ${device.mode}`}{device.targetHumidity && ` · ${device.targetHumidity}`}</p>)}</div><div><label className="text-xs text-gray-400">電源</label><div className="mt-1 flex gap-2"><button onClick={() => sendDehumidifierCommand(device.name, { power: true })} disabled={sending} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${isFailed("power", true) ? "bg-red-500 text-white animate-pulse" : isPending("power", true) ? "bg-amber-500 text-white animate-pulse" : device.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>ON</button><button onClick={() => sendDehumidifierCommand(device.name, { power: false })} disabled={sending} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${isFailed("power", false) ? "bg-red-500 text-white animate-pulse" : isPending("power", false) ? "bg-amber-500 text-white animate-pulse" : device.power === false ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}>OFF</button></div></div><div><label className="text-xs text-gray-400">模式</label><div className="mt-1 flex flex-wrap gap-1.5">{options.dehumidifier.modes.map(m => (<button key={m.value} onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })} disabled={sending} className={btnClass("mode", m.value, device.mode === m.label)}>{m.label}</button>))}</div></div><div><label className="text-xs text-gray-400">目標濕度</label><div className="mt-1 flex flex-wrap gap-1.5">{options.dehumidifier.humidity.map(h => (<button key={h} onClick={() => sendDehumidifierCommand(device.name, { humidity: h })} disabled={sending} className={btnClass("humidity", h, String(device.targetHumidity) === `${h}%`)}>{h}%</button>))}</div></div></>)}
              {device.type === "IR" && (<div><label className="text-xs text-gray-400">遙控按鈕</label><div className="mt-1 flex flex-wrap gap-2">{(device.buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map(btn => (<button key={btn} onClick={() => sendIrCommand(device.name, btn)} className="rounded-lg bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors">{btn}</button>))}</div><p className="mt-1 text-xs text-gray-500">IR 單向發送，不會回傳狀態</p></div>)}
            </div>
          );

          const expandedDev = expandedDevice ? controllableDevices.find(d => d.name === expandedDevice) : null;
          const expandedIdx = expandedDev ? controllableDevices.indexOf(expandedDev) : -1;

          return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {controllableDevices.map((device, index) => {
              const isLastInMobileRow = index % 2 === 1 || index === controllableDevices.length - 1;
              const isLastInDesktopRow = index % 4 === 3 || index === controllableDevices.length - 1;
              const mobileRowStart = Math.floor(index / 2) * 2;
              const desktopRowStart = Math.floor(index / 4) * 4;
              const showMobilePanel = isLastInMobileRow && expandedIdx >= mobileRowStart && expandedIdx < mobileRowStart + 2 && expandedDev;
              const showDesktopPanel = isLastInDesktopRow && expandedIdx >= desktopRowStart && expandedIdx < desktopRowStart + 4 && expandedDev;

              return (
              <React.Fragment key={device.name}>
                <button
                  onClick={() => toggleExpand(device.name)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                    expandedDevice === device.name ? "border-blue-500/50 bg-blue-500/10" : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                  }`}
                >
                  <span className="text-2xl">{deviceIcons[device.type] ?? "📱"}</span>
                  <span className="text-sm font-medium">{device.name}</span>
                  {device.location && <span className="text-xs text-gray-500">{device.location}</span>}
                </button>
                {showMobilePanel && <div className="col-span-2 sm:hidden">{renderPanel(expandedDev!, "")}</div>}
                {showDesktopPanel && <div className="hidden sm:block sm:col-span-4">{renderPanel(expandedDev!, "")}</div>}
              </React.Fragment>
              );
            })}
          </div>
          );
        })()}
        </>)}
      </Card>

      {/* Todos + Food Alerts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>☑️ 待辦事項</CardTitle>
            <Link href="/todos" className="text-sm text-blue-400 hover:text-blue-300">
              查看全部 →
            </Link>
          </CardHeader>
          {myTodos.length > 0 ? (
            <ul className="space-y-2">
              {myTodos.map((todo, i) => {
                const isCompleting = completingItems.has(todo["事項"]);
                return (
                <li key={i} className={`flex items-center gap-3 text-sm transition-all duration-500 ${isCompleting ? "opacity-40 line-through scale-95" : ""}`}>
                  <button
                    onClick={() => !isCompleting && completeTodo(todo["事項"])}
                    disabled={isCompleting}
                    className={`flex-shrink-0 w-4 h-4 rounded border-2 transition-colors ${isCompleting ? "border-green-400 bg-green-400" : "border-gray-500 hover:border-green-400 hover:bg-green-400/20"}`}
                    title="標記完成"
                  >
                    {isCompleting && <svg className="w-full h-full p-0.5" fill="none" viewBox="0 0 24 24" stroke="white"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                  <span className="text-gray-200">
                    {todo["事項"]}
                    {todo["時間"] && <span className="ml-1 text-gray-500">{todo["時間"]}</span>}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{todo["日期"]}</span>
                </li>);
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">沒有待辦事項</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>⚠️ 即期食品</CardTitle>
            <Link href="/food" className="text-sm text-blue-400 hover:text-blue-300">
              查看全部 →
            </Link>
          </CardHeader>
          {urgentFood.length > 0 ? (
            <ul className="space-y-2">
              {urgentFood.map((f, i) => {
                const days = daysUntilExpiry(f["過期日"]);
                const label = days === 0 ? "今天到期" : days === 1 ? "明天到期" : `${days}天後到期`;
                return (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-200">{f["品名"]} {f["數量"]}{f["單位"]}</span>
                    <span className="text-xs text-red-400">{label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">沒有即期食品</p>
          )}
        </Card>
      </div>
    </div>
  );
}
