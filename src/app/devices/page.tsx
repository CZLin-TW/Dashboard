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
  lastPower?: string;
  lastTemperature?: number | string;
  lastMode?: string;
  lastFanSpeed?: string;
  lastUpdatedAt?: string;
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
      if (el) {
        el.classList.add("ring-2", "ring-blue-500");
        setTimeout(() => el.classList.remove("ring-2", "ring-blue-500"), 2000);
      }
    }
  }, [targetDevice, deviceRefs]);

  return null;
}

export default function DevicesPage() {
  const { data: rawDevices, loading, refetch: fetchDevices } = useCachedFetch<DeviceData[]>("/api/devices", []);
  const { data: options } = useCachedFetch<DeviceOptions>("/api/devices/options", DEFAULT_OPTIONS);
  const devices = Array.isArray(rawDevices) ? rawDevices : [];
  const pin = usePinnedDevices();
  const allDevices = devices;

  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [acPendingMap, setAcPendingMap] = useState<Record<string, AcPendingState>>({});
  const [acDirtyMap, setAcDirtyMap] = useState<Record<string, boolean>>({});
  const [acFailedMap, setAcFailedMap] = useState<Record<string, boolean>>({});

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
      setAcFailedMap((prev) => { const next = { ...prev }; delete next[deviceName]; return next; });
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
        // Keep pending state intact so user can retry; flash button red.
        console.error(`[sendAcCommand] ${device.name} failed: HTTP ${res.status}`);
        flashAcFailed(device.name);
        return;
      }
      // Drop local pending so the next render reads the freshly-saved last state.
      setAcPendingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
      setAcDirtyMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
      fetchDevices();
    } catch (err) {
      console.error(`[sendAcCommand] ${device.name} network error:`, err);
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

      // Poll every 1s until state matches, max 10 attempts
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
                fetchDevices();
                return;
              }
            }
          }
        } catch { /* continue polling */ }
      }

      // Timeout: show failure
      setDhPending(null);
      setDhFailed(expected);
      setTimeout(() => setDhFailed(null), 2000);
      fetchDevices();
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

  const sensors = allDevices.filter(d => d.type === "感應器");
  const controllable = allDevices.filter(d => d.type !== "感應器");

  const deviceIcons: Record<string, string> = {
    "空調": "❄️", "IR": "🌀", "除濕機": "💨",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense>
        <DeviceScrollTarget deviceRefs={deviceRefs} />
      </Suspense>
      <h1 className="text-2xl font-bold">📱 裝置控制</h1>

      {/* Sensors */}
      <Card>
        <CardHeader>
          <CardTitle>🌡️ 環境感測器</CardTitle>
          <span className="text-xs text-gray-500">釘選 1 個到首頁</span>
        </CardHeader>
        {sensors.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sensors.map((s) => (
              <div key={s.name} className={`relative rounded-lg p-3 text-center transition-colors ${pin.isSensorPinned(s.name) ? "bg-blue-500/10 border border-blue-500/30" : "bg-gray-800/50"}`}>
                <button
                  onClick={() => pin.setPinnedSensor(pin.isSensorPinned(s.name) ? null : s.name)}
                  className={`absolute top-1.5 right-1.5 text-sm ${pin.isSensorPinned(s.name) ? "text-yellow-400" : "text-gray-600 hover:text-gray-400"}`}
                  title={pin.isSensorPinned(s.name) ? "取消釘選" : "釘選到首頁"}
                >{pin.isSensorPinned(s.name) ? "⭐" : "☆"}</button>
                <p className="text-xs text-gray-400 mb-1">{s.location || s.name}</p>
                <span className="text-xl font-bold">{s.temperature ?? "--"}°C</span>
                <p className="text-sm text-gray-400">{s.humidity ?? "--"}%</p>
              </div>
            ))}
          </div>
        ) : loading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : (
          <p className="text-sm text-gray-500">未偵測到感測器</p>
        )}
      </Card>

      {/* Device Cards - grouped by location */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">釘選最多 {pin.MAX_PINNED_DEVICES} 個到首頁（已選 {pin.pinnedDevices.length}）</p>
        {(pin.pinnedDevices.length > 0 || pin.pinnedSensor) && (
          <button onClick={pin.resetAll} className="text-xs text-red-400 hover:text-red-300">重置釘選</button>
        )}
      </div>
      {(() => {
        const groups: Record<string, DeviceData[]> = {};
        controllable.forEach(d => {
          const loc = d.location || "其他";
          if (!groups[loc]) groups[loc] = [];
          groups[loc].push(d);
        });

        const isPending = (type: string, value: unknown) => dhPending?.type === type && dhPending?.value === value;
        const isFailed = (type: string, value: unknown) => dhFailed?.type === type && dhFailed?.value === value;
        const btnClass = (type: string, value: unknown, isActive: boolean) =>
          `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${isFailed(type, value) ? "bg-red-500 text-white animate-pulse" : isPending(type, value) ? "bg-amber-500 text-white animate-pulse" : isActive ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`;

        return Object.entries(groups).map(([location, devs]) => (
          <div key={location} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 border-b border-gray-800 pb-1">{location}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {devs.map((device) => (
                <div key={device.name} ref={(el) => { deviceRefs.current[device.name] = el; }}>
                  <Card className={pin.isDevicePinned(device.name) ? "border-blue-500/30" : ""}>
                    <CardHeader>
                      <CardTitle>{deviceIcons[device.type] ?? "📱"} {device.name}</CardTitle>
                      <button
                        onClick={() => pin.togglePinDevice(device.name)}
                        disabled={!pin.isDevicePinned(device.name) && !pin.canPinMore}
                        className={`text-sm transition-colors ${pin.isDevicePinned(device.name) ? "text-yellow-400" : pin.canPinMore ? "text-gray-600 hover:text-gray-400" : "text-gray-700 cursor-not-allowed"}`}
                        title={pin.isDevicePinned(device.name) ? "取消釘選" : pin.canPinMore ? "釘選到首頁" : `已達上限 ${pin.MAX_PINNED_DEVICES} 個`}
                      >{pin.isDevicePinned(device.name) ? "⭐" : "☆"}</button>
                    </CardHeader>

                    {device.type === "空調" && (() => {
                      const pending = getAcPending(device);
                      const dirty = !!acDirtyMap[device.name];
                      const failed = !!acFailedMap[device.name];
                      const lastTime = device.lastUpdatedAt ? (device.lastUpdatedAt.split(" ")[1] || device.lastUpdatedAt) : "";
                      return (
                      <div className="space-y-3">
                        {device.lastPower ? (
                          <p className="text-xs text-gray-400">
                            目前：{device.lastPower === "on" ? (
                              <>🟢 {device.lastTemperature !== undefined && device.lastTemperature !== "" && `${device.lastTemperature}°C`}{device.lastMode && ` ${device.lastMode}`}{device.lastFanSpeed && ` ${device.lastFanSpeed}`}</>
                            ) : "⚪ 關閉"}{lastTime && ` · ${lastTime}`}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500">尚無使用記錄</p>
                        )}
                        <div><label className="text-xs text-gray-400">電源</label><div className="mt-1 flex gap-2"><button onClick={() => updateAcPending(device, { power: true })} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${pending.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>ON</button><button onClick={() => updateAcPending(device, { power: false })} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${!pending.power ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>OFF</button></div></div>
                        <div><label className="text-xs text-gray-400">溫度</label><div className="mt-1 flex items-center gap-3"><button onClick={() => updateAcPending(device, { temperature: Math.max(options.ac.temperature.min, pending.temperature - 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">−</button><span className="w-16 text-center text-xl font-bold">{pending.temperature}°C</span><button onClick={() => updateAcPending(device, { temperature: Math.min(options.ac.temperature.max, pending.temperature + 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">+</button></div></div>
                        <div><label className="text-xs text-gray-400">模式</label><div className="mt-1 flex flex-wrap gap-2">{options.ac.modes.map((m) => (<button key={m.value} onClick={() => updateAcPending(device, { mode: m.value })} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${pending.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{m.label}</button>))}</div></div>
                        <div><label className="text-xs text-gray-400">風速</label><div className="mt-1 flex flex-wrap gap-2">{options.ac.fan_speeds.map((s) => (<button key={s.value} onClick={() => updateAcPending(device, { fanSpeed: s.value })} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${pending.fanSpeed === s.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{s.label}</button>))}</div></div>
                        <button onClick={() => sendAcCommand(device)} disabled={sending} className={`w-full rounded-lg py-2.5 text-sm font-bold transition-colors ${failed ? "bg-red-500 text-white animate-pulse" : dirty ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-700 text-gray-400"}`}>{failed ? "失敗，請重試" : sending ? "送出中..." : dirty ? "送出設定" : "未變更"}</button>
                      </div>
                      );
                    })()}

                    {device.type === "除濕機" && (
                      <div className="space-y-3">
                        {device.power !== undefined && (<p className="text-xs text-gray-400">目前：{device.power ? "🟢 運轉中" : "⚪ 關閉"}{device.mode && ` · ${device.mode}`}{device.targetHumidity && ` · 目標 ${device.targetHumidity}%`}</p>)}
                        <div><label className="text-xs text-gray-400">電源</label><div className="mt-1 flex gap-2"><button onClick={() => sendDehumidifierCommand(device.name, { power: true })} disabled={sending} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${isFailed("power", true) ? "bg-red-500 text-white animate-pulse" : isPending("power", true) ? "bg-amber-500 text-white animate-pulse" : device.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>ON</button><button onClick={() => sendDehumidifierCommand(device.name, { power: false })} disabled={sending} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${isFailed("power", false) ? "bg-red-500 text-white animate-pulse" : isPending("power", false) ? "bg-amber-500 text-white animate-pulse" : device.power === false ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>OFF</button></div></div>
                        <div><label className="text-xs text-gray-400">模式</label><div className="mt-1 flex flex-wrap gap-2">{options.dehumidifier.modes.map((m) => (<button key={m.value} onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })} disabled={sending} className={btnClass("mode", m.value, device.mode === m.label)}>{m.label}</button>))}</div></div>
                        <div><label className="text-xs text-gray-400">目標濕度</label><div className="mt-1 flex flex-wrap gap-2">{options.dehumidifier.humidity.map((h) => (<button key={h} onClick={() => sendDehumidifierCommand(device.name, { humidity: h })} disabled={sending} className={btnClass("humidity", h, device.targetHumidity === h)}>{h}%</button>))}</div></div>
                      </div>
                    )}

                    {device.type === "IR" && (
                      <div>
                        <label className="text-xs text-gray-400">遙控按鈕</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(device.buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map((btn) => (
                            <button key={btn} onClick={() => sendIrCommand(device.name, btn)} className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors">{btn}</button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-gray-500">IR 遙控為單向發送，不會回傳裝置狀態</p>
                      </div>
                    )}
                  </Card>
                </div>
              ))}
            </div>
          </div>
        ));
      })()}
    </div>
  );
}
