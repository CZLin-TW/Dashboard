"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";

interface AcPendingState {
  power: boolean;
  temperature: number;
  mode: string;
  fanSpeed: string;
}

interface DeviceData {
  name: string;
  type: string;
  location: string;
  deviceId: string;
  temperature?: number;
  humidity?: number;
  power?: boolean;
  mode?: string;
  targetHumidity?: number;
  buttons?: string;
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

const DEFAULT_OPTIONS: DeviceOptions = {
  ac: { modes: [], fan_speeds: [], temperature: { min: 16, max: 30 } },
  dehumidifier: { modes: [], humidity: [] },
};

function DeviceScrollTarget({ deviceRefs }: { deviceRefs: React.RefObject<Record<string, HTMLDivElement | null>> }) {
  const searchParams = useSearchParams();
  const targetDevice = searchParams.get("target");
  useEffect(() => {
    if (targetDevice && deviceRefs.current?.[targetDevice]) {
      deviceRefs.current[targetDevice]?.scrollIntoView({ behavior: "smooth", block: "center" });
      const el = deviceRefs.current[targetDevice];
      if (el) { el.classList.add("ring-2", "ring-blue-500"); setTimeout(() => el.classList.remove("ring-2", "ring-blue-500"), 2000); }
    }
  }, [targetDevice, deviceRefs]);
  return null;
}

export default function DevicesPage() {
  const { data: rawDevices, loading, refetch: fetchDevices } = useCachedFetch<DeviceData[]>("/api/devices", []);
  const { data: options } = useCachedFetch<DeviceOptions>("/api/devices/options", DEFAULT_OPTIONS);
  const devices = Array.isArray(rawDevices) ? rawDevices : [];
  const pin = usePinnedDevices();

  // TODO: mock devices for testing - remove when real devices are added
  const mockDevices: DeviceData[] = [
    { name: "SwitchBot Hub \u4e3b\u81e5", type: "\u611f\u61c9\u5668", location: "\u4e3b\u81e5", deviceId: "mock-1", temperature: 25.8, humidity: 58 },
    { name: "SwitchBot Hub \u6b21\u81e5", type: "\u611f\u61c9\u5668", location: "\u6b21\u81e5", deviceId: "mock-2", temperature: 24.2, humidity: 65 },
    { name: "\u4e3b\u81e5\u7a7a\u8abf", type: "\u7a7a\u8abf", location: "\u4e3b\u81e5", deviceId: "mock-3" },
    { name: "\u6b21\u81e5\u7a7a\u8abf", type: "\u7a7a\u8abf", location: "\u6b21\u81e5", deviceId: "mock-4" },
    { name: "\u4e3b\u81e5\u96fb\u98a8\u6247", type: "IR", location: "\u4e3b\u81e5", deviceId: "mock-5", buttons: "\u96fb\u6e90,\u98a8\u901f+,\u98a8\u901f-" },
    { name: "\u6b21\u81e5\u96fb\u98a8\u6247", type: "IR", location: "\u6b21\u81e5", deviceId: "mock-6", buttons: "\u96fb\u6e90,\u98a8\u901f+,\u98a8\u901f-" },
  ];
  const allDevices = [...devices, ...mockDevices];

  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [acPending, setAcPending] = useState<AcPendingState>({ power: false, temperature: 26, mode: "cool", fanSpeed: "auto" });
  const [acDirty, setAcDirty] = useState(false);

  function updateAcPending(updates: Partial<AcPendingState>) { setAcPending((prev) => ({ ...prev, ...updates })); setAcDirty(true); }

  async function sendAcCommand() {
    const ac = allDevices.find(d => d.type === "\u7a7a\u8abf"); if (!ac) return;
    setSending(true);
    try { await fetch("/api/devices/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceName: ac.name, action: "setAll", params: acPending }) }); setAcDirty(false); } finally { setSending(false); }
  }

  async function sendDehumidifierCommand(deviceName: string, params: Record<string, unknown>) {
    const expected: { type: string; value: unknown } = params.power !== undefined ? { type: "power", value: params.power } : params.mode !== undefined ? { type: "mode", value: params.mode } : { type: "humidity", value: params.humidity };
    setDhPending(expected); setDhFailed(null); setSending(true);
    try {
      await fetch("/api/devices/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceName, action: "dehumidifier", params }) });
      for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 1000)); try { const res = await fetch("/api/devices"); const data = await res.json(); if (Array.isArray(data)) { const dh = data.find((d: DeviceData) => d.name === deviceName); if (dh) { const matched = (expected.type === "power" && dh.power === expected.value) || (expected.type === "mode" && dh.mode === expected.value) || (expected.type === "humidity" && dh.targetHumidity === expected.value); if (matched) { setDhPending(null); fetchDevices(); return; } } } } catch { /* continue */ } }
      setDhPending(null); setDhFailed(expected); setTimeout(() => setDhFailed(null), 2000); fetchDevices();
    } finally { setSending(false); }
  }

  async function sendIrCommand(deviceName: string, button: string) { await fetch("/api/devices/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceName, action: "ir", params: { button } }) }); }

  const sensors = allDevices.filter(d => d.type === "\u611f\u61c9\u5668");
  const controllable = allDevices.filter(d => d.type !== "\u611f\u61c9\u5668");
  const deviceIcons: Record<string, string> = { "\u7a7a\u8abf": "\u2744\ufe0f", "IR": "\ud83c\udf00", "\u9664\u6fd5\u6a5f": "\ud83d\udca8" };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense><DeviceScrollTarget deviceRefs={deviceRefs} /></Suspense>
      <h1 className="text-2xl font-bold">{"\ud83d\udcf1"} \u88dd\u7f6e\u63a7\u5236</h1>

      {/* Sensors */}
      <Card>
        <CardHeader><CardTitle>{"\ud83c\udf21\ufe0f"} \u74b0\u5883\u611f\u6e2c\u5668</CardTitle><span className="text-xs text-gray-500">{"\ud83d\udccc"} \u91d8\u9078 1 \u500b\u5230\u9996\u9801</span></CardHeader>
        {sensors.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sensors.map((s) => (
              <div key={s.name} className={`relative rounded-lg p-3 text-center transition-colors ${pin.isSensorPinned(s.name) ? "bg-blue-500/10 border border-blue-500/30" : "bg-gray-800/50"}`}>
                <button onClick={() => pin.setPinnedSensor(pin.isSensorPinned(s.name) ? null : s.name)} className={`absolute top-1.5 right-1.5 text-sm ${pin.isSensorPinned(s.name) ? "text-blue-400" : "text-gray-600 hover:text-gray-400"}`} title={pin.isSensorPinned(s.name) ? "\u53d6\u6d88\u91d8\u9078" : "\u91d8\u9078\u5230\u9996\u9801"}>{"\ud83d\udccc"}</button>
                <p className="text-xs text-gray-400 mb-1">{s.location || s.name}</p>
                <span className="text-xl font-bold">{s.temperature ?? "--"}{"\u00b0"}C</span>
                <p className="text-sm text-gray-400">{s.humidity ?? "--"}%</p>
              </div>
            ))}
          </div>
        ) : loading ? (<p className="text-sm text-gray-500">\u8f09\u5165\u4e2d...</p>) : (<p className="text-sm text-gray-500">\u672a\u5075\u6e2c\u5230\u611f\u6e2c\u5668</p>)}
      </Card>

      {/* Device Cards */}
      <div className="flex items-center justify-between mb-2"><span className="text-xs text-gray-500">{"\ud83d\udccc"} \u91d8\u9078\u6700\u591a {pin.MAX_PINNED_DEVICES} \u500b\u5230\u9996\u9801\uff08\u5df2\u9078 {pin.pinnedDevices.length}\uff09</span></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {controllable.map((device) => (
          <div key={device.name} ref={(el) => { deviceRefs.current[device.name] = el; }} className="transition-all duration-300">
            <Card className={pin.isDevicePinned(device.name) ? "border-blue-500/30" : ""}>
              <CardHeader>
                <CardTitle>{deviceIcons[device.type] ?? "\ud83d\udcf1"} {device.name}{device.location && <span className="ml-2 text-xs font-normal text-gray-500">{device.location}</span>}</CardTitle>
                <button onClick={() => pin.togglePinDevice(device.name)} disabled={!pin.isDevicePinned(device.name) && !pin.canPinMore} className={`text-sm transition-colors ${pin.isDevicePinned(device.name) ? "text-blue-400" : pin.canPinMore ? "text-gray-600 hover:text-gray-400" : "text-gray-700 cursor-not-allowed"}`} title={pin.isDevicePinned(device.name) ? "\u53d6\u6d88\u91d8\u9078" : pin.canPinMore ? "\u91d8\u9078\u5230\u9996\u9801" : `\u5df2\u9054\u4e0a\u9650 ${pin.MAX_PINNED_DEVICES} \u500b`}>{"\ud83d\udccc"}</button>
              </CardHeader>

              {device.type === "\u7a7a\u8abf" && (<div className="space-y-4"><div><label className="text-xs text-gray-400">\u96fb\u6e90</label><div className="mt-1 flex gap-2"><button onClick={() => updateAcPending({ power: true })} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${acPending.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>ON</button><button onClick={() => updateAcPending({ power: false })} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${!acPending.power ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>OFF</button></div></div><div><label className="text-xs text-gray-400">\u6eab\u5ea6</label><div className="mt-1 flex items-center gap-3"><button onClick={() => updateAcPending({ temperature: Math.max(options.ac.temperature.min, acPending.temperature - 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">{"\u2212"}</button><span className="w-16 text-center text-xl font-bold">{acPending.temperature}{"\u00b0"}C</span><button onClick={() => updateAcPending({ temperature: Math.min(options.ac.temperature.max, acPending.temperature + 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">+</button></div></div><div><label className="text-xs text-gray-400">\u6a21\u5f0f</label><div className="mt-1 flex flex-wrap gap-2">{options.ac.modes.map((m) => (<button key={m.value} onClick={() => updateAcPending({ mode: m.value })} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${acPending.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{m.label}</button>))}</div></div><div><label className="text-xs text-gray-400">\u98a8\u901f</label><div className="mt-1 flex flex-wrap gap-2">{options.ac.fan_speeds.map((s) => (<button key={s.value} onClick={() => updateAcPending({ fanSpeed: s.value })} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${acPending.fanSpeed === s.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{s.label}</button>))}</div></div><button onClick={sendAcCommand} disabled={sending} className={`w-full rounded-lg py-2.5 text-sm font-bold transition-colors ${acDirty ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-700 text-gray-400"}`}>{sending ? "\u9001\u51fa\u4e2d..." : acDirty ? "\u9001\u51fa\u8a2d\u5b9a" : "\u672a\u8b8a\u66f4"}</button><p className="text-xs text-gray-500">\u8abf\u6574\u4e0a\u65b9\u8a2d\u5b9a\u5f8c\u6309\u300c\u9001\u51fa\u300d\uff0c\u624d\u6703\u5be6\u969b\u767c\u9001 IR \u6307\u4ee4</p></div>)}

              {device.type === "\u9664\u6fd5\u6a5f" && (() => { const isPending = (type: string, value: unknown) => dhPending?.type === type && dhPending?.value === value; const isFailed = (type: string, value: unknown) => dhFailed?.type === type && dhFailed?.value === value; const btnClass = (type: string, value: unknown, isActive: boolean) => `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${isFailed(type, value) ? "bg-red-500 text-white animate-pulse" : isPending(type, value) ? "bg-amber-500 text-white animate-pulse" : isActive ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`; return (<div className="space-y-4">{device.power !== undefined && (<p className="text-xs text-gray-400">\u76ee\u524d\u72c0\u614b\uff1a{device.power ? "\ud83d\udfe2 \u904b\u8f49\u4e2d" : "\u26aa \u95dc\u9589"}{device.mode && ` \u00b7 ${device.mode}`}{device.targetHumidity && ` \u00b7 \u76ee\u6a19 ${device.targetHumidity}%`}</p>)}<div><label className="text-xs text-gray-400">\u96fb\u6e90</label><div className="mt-1 flex gap-2"><button onClick={() => sendDehumidifierCommand(device.name, { power: true })} disabled={sending} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${isFailed("power", true) ? "bg-red-500 text-white animate-pulse" : isPending("power", true) ? "bg-amber-500 text-white animate-pulse" : device.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>ON</button><button onClick={() => sendDehumidifierCommand(device.name, { power: false })} disabled={sending} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${isFailed("power", false) ? "bg-red-500 text-white animate-pulse" : isPending("power", false) ? "bg-amber-500 text-white animate-pulse" : device.power === false ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>OFF</button></div></div><div><label className="text-xs text-gray-400">\u6a21\u5f0f</label><div className="mt-1 flex flex-wrap gap-2">{options.dehumidifier.modes.map((m) => (<button key={m.value} onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })} disabled={sending} className={btnClass("mode", m.value, device.mode === m.label)}>{m.label}</button>))}</div></div><div><label className="text-xs text-gray-400">\u76ee\u6a19\u6fd5\u5ea6</label><div className="mt-1 flex flex-wrap gap-2">{options.dehumidifier.humidity.map((h) => (<button key={h} onClick={() => sendDehumidifierCommand(device.name, { humidity: h })} disabled={sending} className={btnClass("humidity", h, device.targetHumidity === h)}>{h}%</button>))}</div></div></div>); })()}

              {device.type === "IR" && (<div><label className="text-xs text-gray-400">\u9059\u63a7\u6309\u9215</label><div className="mt-2 flex flex-wrap gap-2">{(device.buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map((btn) => (<button key={btn} onClick={() => sendIrCommand(device.name, btn)} className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors">{btn}</button>))}</div><p className="mt-2 text-xs text-gray-500">IR \u9059\u63a7\u70ba\u55ae\u5411\u767c\u9001\uff0c\u4e0d\u6703\u56de\u50b3\u88dd\u7f6e\u72c0\u614b</p></div>)}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
