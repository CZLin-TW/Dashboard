"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import { useState } from "react";

interface WeatherData { location: string; city: string; date_label: string; date: string; wx: string; min_t: number | null; max_t: number | null; min_at: number | null; max_at: number | null; pop: number | null; }
interface DeviceData { name: string; type: string; location?: string; temperature?: number; humidity?: number; power?: boolean; mode?: string; targetHumidity?: string; buttons?: string; }
interface DeviceOptions { ac: { modes: Array<{ value: string; label: string }>; fan_speeds: Array<{ value: string; label: string }>; temperature: { min: number; max: number }; }; dehumidifier: { modes: Array<{ value: string; label: string }>; humidity: number[]; }; }
interface TodoData { "\u4e8b\u9805": string; "\u65e5\u671f": string; "\u6642\u9593": string; "\u8ca0\u8cac\u4eba": string; "\u72c0\u614b": string; }
interface FoodData { "\u54c1\u540d": string; "\u6578\u91cf": string; "\u55ae\u4f4d": string; "\u904e\u671f\u65e5": string; }

function daysUntilExpiry(expiry: string): number { const today = new Date(); today.setHours(0, 0, 0, 0); return Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)); }

const DEFAULT_OPTIONS: DeviceOptions = { ac: { modes: [], fan_speeds: [], temperature: { min: 16, max: 30 } }, dehumidifier: { modes: [], humidity: [] } };

export default function HomePage() {
  const { currentUser } = useUser();
  const { data: weatherToday } = useCachedFetch<WeatherData | null>("/api/weather?date=today", null);
  const { data: weatherTomorrow } = useCachedFetch<WeatherData | null>("/api/weather?date=tomorrow", null);
  const todayHasData = weatherToday && !("error" in weatherToday) && weatherToday.max_t !== null;
  const weather = todayHasData ? weatherToday : weatherTomorrow;
  const { data: rawDevices, refetch: refetchDevices } = useCachedFetch<DeviceData[]>("/api/devices", []);
  const { data: rawTodos, refetch: refetchTodos } = useCachedFetch<TodoData[]>("/api/todos", []);
  const { data: rawFood } = useCachedFetch<FoodData[]>("/api/food", []);
  const { data: options } = useCachedFetch<DeviceOptions>("/api/devices/options", DEFAULT_OPTIONS);

  const devices = Array.isArray(rawDevices) ? rawDevices : [];
  const todos = Array.isArray(rawTodos) ? rawTodos : [];
  const food = Array.isArray(rawFood) ? rawFood : [];
  const pin = usePinnedDevices();

  const pinnedSensor = pin.pinnedSensor ? devices.find(d => d.name === pin.pinnedSensor) : null;
  const controllableDevices = devices.filter(d => d.type !== "\u611f\u61c9\u5668" && pin.isDevicePinned(d.name));

  const myTodos = todos.filter(t => t["\u72c0\u614b"] === "\u5f85\u8fa6" && (!currentUser || t["\u8ca0\u8cac\u4eba"] === currentUser.name || t["\u8ca0\u8cac\u4eba"] === currentUser.name.substring(0, 2))).sort((a, b) => { const dateA = `${a["\u65e5\u671f"]} ${a["\u6642\u9593"] || "99:99"}`; const dateB = `${b["\u65e5\u671f"]} ${b["\u6642\u9593"] || "99:99"}`; return dateA.localeCompare(dateB); }).slice(0, 5);
  const urgentFood = food.filter(f => { const days = daysUntilExpiry(f["\u904e\u671f\u65e5"]); return days >= 0 && days <= 3; });
  const deviceIcons: Record<string, string> = { "\u7a7a\u8abf": "\u2744\ufe0f", "IR": "\ud83c\udf00", "\u9664\u6fd5\u6a5f": "\ud83d\udca8" };

  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [acPending, setAcPending] = useState({ power: true, temperature: 26, mode: "\u51b7\u6c23", fanSpeed: "\u81ea\u52d5" });
  const [acDirty, setAcDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const [completingItems, setCompletingItems] = useState<Set<string>>(new Set());

  function toggleExpand(name: string) { setExpandedDevice(prev => prev === name ? null : name); setAcDirty(false); }
  function updateAcPending(updates: Partial<typeof acPending>) { setAcPending(prev => ({ ...prev, ...updates })); setAcDirty(true); }

  async function sendAcCommand(deviceName: string) { setSending(true); try { await fetch("/api/devices/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceName, action: "setAll", params: acPending }) }); setAcDirty(false); } finally { setSending(false); } }

  async function sendDehumidifierCommand(deviceName: string, params: Record<string, unknown>) {
    const expected: { type: string; value: unknown } = params.power !== undefined ? { type: "power", value: params.power } : params.mode !== undefined ? { type: "mode", value: params.mode } : { type: "humidity", value: params.humidity };
    setDhPending(expected); setDhFailed(null); setSending(true);
    try { await fetch("/api/devices/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceName, action: "dehumidifier", params }) });
      for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 1000)); try { const res = await fetch("/api/devices"); const data = await res.json(); if (Array.isArray(data)) { const dh = data.find((d: DeviceData) => d.name === deviceName); if (dh) { const matched = (expected.type === "power" && dh.power === expected.value) || (expected.type === "mode" && dh.mode === expected.value) || (expected.type === "humidity" && dh.targetHumidity === expected.value); if (matched) { setDhPending(null); refetchDevices(); return; } } } } catch { /* continue */ } }
      setDhPending(null); setDhFailed(expected); setTimeout(() => setDhFailed(null), 2000); refetchDevices();
    } finally { setSending(false); }
  }

  async function sendIrCommand(deviceName: string, button: string) { await fetch("/api/devices/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceName, action: "ir", params: { button } }) }); }

  function completeTodo(item: string) { setCompletingItems(prev => new Set(prev).add(item)); fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" }).then(() => { setTimeout(() => { setCompletingItems(prev => { const next = new Set(prev); next.delete(item); return next; }); refetchTodos(); }, 500); }); }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Weather */}
      <Card>
        <CardHeader><CardTitle>{"\ud83c\udf24\ufe0f"} \u5929\u6c23{weather?.date_label && !todayHasData ? `\uff08${weather.date_label}\uff09` : ""}</CardTitle></CardHeader>
        {weather && !("error" in weather) && weather.max_t !== null ? (<><div className="flex items-baseline gap-3"><span className="text-3xl font-bold">{weather.max_t}{"\u00b0"}C</span><span className="text-gray-400">{weather.wx}</span></div><p className="mt-1 text-sm text-gray-500">{"\ud83d\udccd"} {weather.city}{weather.location} {"\u00b7"} {weather.min_t}~{weather.max_t}{"\u00b0"}C{weather.pop !== null && ` \u00b7 \u964d\u96e8 ${weather.pop}%`}</p></>) : (<p className="text-sm text-gray-500">\u8f09\u5165\u4e2d...</p>)}
      </Card>

      {/* Indoor Sensor (pinned) */}
      <Card>
        <CardHeader><CardTitle>{"\ud83c\udf21\ufe0f"} \u5ba4\u5167\u74b0\u5883</CardTitle></CardHeader>
        {pinnedSensor ? (<><div className="flex items-baseline gap-6"><div><span className="text-3xl font-bold">{pinnedSensor.temperature}{"\u00b0"}C</span></div><div><span className="text-3xl font-bold">{pinnedSensor.humidity}%</span><span className="ml-1 text-sm text-gray-400">\u6fd5\u5ea6</span></div></div><p className="mt-1 text-sm text-gray-500">{pinnedSensor.location || pinnedSensor.name}</p></>) : (<p className="text-sm text-gray-500">\u8acb\u5230<Link href="/devices" className="text-blue-400 hover:text-blue-300 mx-1">\u88dd\u7f6e\u9801</Link>{"\ud83d\udccc"} \u91d8\u9078\u4e00\u500b\u611f\u6e2c\u5668</p>)}
      </Card>

      {/* Devices Quick Control (pinned only) */}
      <Card>
        <CardHeader><CardTitle>{"\ud83d\udcf1"} \u88dd\u7f6e\u5feb\u6377</CardTitle><Link href="/devices" className="text-sm text-blue-400 hover:text-blue-300">\u67e5\u770b\u5168\u90e8 \u2192</Link></CardHeader>
        {controllableDevices.length === 0 ? (
          <p className="text-sm text-gray-500">\u8acb\u5230<Link href="/devices" className="text-blue-400 hover:text-blue-300 mx-1">\u88dd\u7f6e\u9801</Link>{"\ud83d\udccc"} \u91d8\u9078\u88dd\u7f6e</p>
        ) : (<>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {controllableDevices.map((device) => (
            <button key={device.name} onClick={() => toggleExpand(device.name)} className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${expandedDevice === device.name ? "border-blue-500/50 bg-blue-500/10" : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"}`}>
              <span className="text-2xl">{deviceIcons[device.type] ?? "\ud83d\udcf1"}</span><span className="text-sm font-medium">{device.name}</span>{device.location && <span className="text-xs text-gray-500">{device.location}</span>}
            </button>
          ))}
        </div>
        {expandedDevice && (() => {
          const device = controllableDevices.find(d => d.name === expandedDevice);
          if (!device) return null;
          const isPending = (type: string, value: unknown) => dhPending?.type === type && dhPending?.value === value;
          const isFailed = (type: string, value: unknown) => dhFailed?.type === type && dhFailed?.value === value;
          const btnClass = (type: string, value: unknown, isActive: boolean) => `rounded px-2.5 py-1 text-xs font-medium transition-colors ${isFailed(type, value) ? "bg-red-500 text-white animate-pulse" : isPending(type, value) ? "bg-amber-500 text-white animate-pulse" : isActive ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`;
          return (
            <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/30 p-4 space-y-4">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-200">{deviceIcons[device.type]} {device.name}{device.location && <span className="ml-2 text-xs font-normal text-gray-500">{device.location}</span>}</h3><button onClick={() => setExpandedDevice(null)} className="text-xs text-gray-500 hover:text-gray-300">\u6536\u5408 \u25b2</button></div>
              {device.type === "\u7a7a\u8abf" && (<><div><label className="text-xs text-gray-400">\u96fb\u6e90</label><div className="mt-1 flex gap-2"><button onClick={() => updateAcPending({ power: true })} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${acPending.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>ON</button><button onClick={() => updateAcPending({ power: false })} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${!acPending.power ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}>OFF</button></div></div><div><label className="text-xs text-gray-400">\u6eab\u5ea6</label><div className="mt-1 flex items-center gap-2"><button onClick={() => updateAcPending({ temperature: Math.max(options.ac.temperature.min, acPending.temperature - 1) })} className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-sm">{"\u2212"}</button><span className="w-14 text-center font-bold">{acPending.temperature}{"\u00b0"}C</span><button onClick={() => updateAcPending({ temperature: Math.min(options.ac.temperature.max, acPending.temperature + 1) })} className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-sm">+</button></div></div><div><label className="text-xs text-gray-400">\u6a21\u5f0f</label><div className="mt-1 flex flex-wrap gap-1.5">{options.ac.modes.map(m => (<button key={m.value} onClick={() => updateAcPending({ mode: m.value })} className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${acPending.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{m.label}</button>))}</div></div><div><label className="text-xs text-gray-400">\u98a8\u901f</label><div className="mt-1 flex flex-wrap gap-1.5">{options.ac.fan_speeds.map(s => (<button key={s.value} onClick={() => updateAcPending({ fanSpeed: s.value })} className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${acPending.fanSpeed === s.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{s.label}</button>))}</div></div><button onClick={() => sendAcCommand(device.name)} disabled={sending} className={`w-full rounded-lg py-2 text-sm font-bold transition-colors ${acDirty ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-700 text-gray-400"}`}>{sending ? "\u9001\u51fa\u4e2d..." : acDirty ? "\u9001\u51fa\u8a2d\u5b9a" : "\u672a\u8b8a\u66f4"}</button></>)}
              {device.type === "\u9664\u6fd5\u6a5f" && (<><div>{device.power !== undefined && (<p className="text-xs text-gray-400">\u76ee\u524d\uff1a{device.power ? "\ud83d\udfe2 \u904b\u8f49\u4e2d" : "\u26aa \u95dc\u9589"}{device.mode && ` \u00b7 ${device.mode}`}{device.targetHumidity && ` \u00b7 ${device.targetHumidity}`}</p>)}</div><div><label className="text-xs text-gray-400">\u96fb\u6e90</label><div className="mt-1 flex gap-2"><button onClick={() => sendDehumidifierCommand(device.name, { power: true })} disabled={sending} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${isFailed("power", true) ? "bg-red-500 text-white animate-pulse" : isPending("power", true) ? "bg-amber-500 text-white animate-pulse" : device.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>ON</button><button onClick={() => sendDehumidifierCommand(device.name, { power: false })} disabled={sending} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${isFailed("power", false) ? "bg-red-500 text-white animate-pulse" : isPending("power", false) ? "bg-amber-500 text-white animate-pulse" : device.power === false ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}>OFF</button></div></div><div><label className="text-xs text-gray-400">\u6a21\u5f0f</label><div className="mt-1 flex flex-wrap gap-1.5">{options.dehumidifier.modes.map(m => (<button key={m.value} onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })} disabled={sending} className={btnClass("mode", m.value, device.mode === m.label)}>{m.label}</button>))}</div></div><div><label className="text-xs text-gray-400">\u76ee\u6a19\u6fd5\u5ea6</label><div className="mt-1 flex flex-wrap gap-1.5">{options.dehumidifier.humidity.map(h => (<button key={h} onClick={() => sendDehumidifierCommand(device.name, { humidity: h })} disabled={sending} className={btnClass("humidity", h, String(device.targetHumidity) === `${h}%`)}>{h}%</button>))}</div></div></>)}
              {device.type === "IR" && (<div><label className="text-xs text-gray-400">\u9059\u63a7\u6309\u9215</label><div className="mt-1 flex flex-wrap gap-2">{(device.buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map(btn => (<button key={btn} onClick={() => sendIrCommand(device.name, btn)} className="rounded-lg bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors">{btn}</button>))}</div><p className="mt-1 text-xs text-gray-500">IR \u55ae\u5411\u767c\u9001\uff0c\u4e0d\u6703\u56de\u50b3\u72c0\u614b</p></div>)}
            </div>);
        })()}
        </>)}
      </Card>

      {/* Todos + Food */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{"\u2611\ufe0f"} \u5f85\u8fa6\u4e8b\u9805</CardTitle><Link href="/todos" className="text-sm text-blue-400 hover:text-blue-300">\u67e5\u770b\u5168\u90e8 \u2192</Link></CardHeader>
          {myTodos.length > 0 ? (<ul className="space-y-2">{myTodos.map((todo, i) => { const isCompleting = completingItems.has(todo["\u4e8b\u9805"]); return (<li key={i} className={`flex items-center gap-3 text-sm transition-all duration-500 ${isCompleting ? "opacity-40 line-through scale-95" : ""}`}><button onClick={() => !isCompleting && completeTodo(todo["\u4e8b\u9805"])} disabled={isCompleting} className={`flex-shrink-0 w-4 h-4 rounded border-2 transition-colors ${isCompleting ? "border-green-400 bg-green-400" : "border-gray-500 hover:border-green-400 hover:bg-green-400/20"}`} title="\u6a19\u8a18\u5b8c\u6210">{isCompleting && <svg className="w-full h-full p-0.5" fill="none" viewBox="0 0 24 24" stroke="white"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</button><span className="text-gray-200">{todo["\u4e8b\u9805"]}{todo["\u6642\u9593"] && <span className="ml-1 text-gray-500">{todo["\u6642\u9593"]}</span>}</span><span className="ml-auto text-xs text-gray-500">{todo["\u65e5\u671f"]}</span></li>); })}</ul>) : (<p className="text-sm text-gray-500">\u6c92\u6709\u5f85\u8fa6\u4e8b\u9805</p>)}
        </Card>
        <Card>
          <CardHeader><CardTitle>{"\u26a0\ufe0f"} \u5373\u671f\u98df\u54c1</CardTitle><Link href="/food" className="text-sm text-blue-400 hover:text-blue-300">\u67e5\u770b\u5168\u90e8 \u2192</Link></CardHeader>
          {urgentFood.length > 0 ? (<ul className="space-y-2">{urgentFood.map((f, i) => { const days = daysUntilExpiry(f["\u904e\u671f\u65e5"]); const label = days === 0 ? "\u4eca\u5929\u5230\u671f" : days === 1 ? "\u660e\u5929\u5230\u671f" : `${days}\u5929\u5f8c\u5230\u671f`; return (<li key={i} className="flex items-center justify-between text-sm"><span className="text-gray-200">{f["\u54c1\u540d"]} {f["\u6578\u91cf"]}{f["\u55ae\u4f4d"]}</span><span className="text-xs text-red-400">{label}</span></li>); })}</ul>) : (<p className="text-sm text-gray-500">\u6c92\u6709\u5373\u671f\u98df\u54c1</p>)}
        </Card>
      </div>
    </div>
  );
}
