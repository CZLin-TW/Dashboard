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

  // TODO: mock devices for testing - remove when real devices are added
  const mockDevices: DeviceData[] = [
    { name: "SwitchBot Hub 主臥", type: "感應器", location: "主臥", deviceId: "mock-1", temperature: 25.8, humidity: 58 },
    { name: "SwitchBot Hub 次臥", type: "感應器", location: "次臥", deviceId: "mock-2", temperature: 24.2, humidity: 65 },
    { name: "主臥空調", type: "空調", location: "主臥", deviceId: "mock-3" },
    { name: "次臥空調", type: "空調", location: "次臥", deviceId: "mock-4" },
    { name: "主臥電風扇", type: "IR", location: "主臥", deviceId: "mock-5", buttons: "電源,風速+,風速-" },
    { name: "次臥電風扇", type: "IR", location: "次臥", deviceId: "mock-6", buttons: "電源,風速+,風速-" },
  ];
  const allDevices = [...devices, ...mockDevices];

  const [sending, setSending] = useState(false);
  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [acPending, setAcPending] = useState<AcPendingState>({
    power: false, temperature: 26, mode: "cool", fanSpeed: "auto",
  });
  const [acDirty, setAcDirty] = useState(false);

  function updateAcPending(updates: Partial<AcPendingState>) {
    setAcPending((prev) => ({ ...prev, ...updates }));
    setAcDirty(true);
  }

  async function sendAcCommand() {
    const ac = devices.find(d => d.type === "空調");
    if (!ac) return;
    setSending(true);
    try {
      await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: ac.name, action: "setAll", params: acPending }),
      });
      setAcDirty(false);
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
    await fetch("/api/devices/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName, action: "ir", params: { button } }),
    });
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
          <span className="text-xs text-gray-500">📌 釘選 1 個到首頁</span>
        </CardHeader>
        {sensors.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sensors.map((s) => (
              <div key={s.name} className={`relative rounded-lg p-3 text-center transition-colors ${pin.isSensorPinned(s.name) ? "bg-blue-500/10 border border-blue-500/30" : "bg-gray-800/50"}`}>
                <button
                  onClick={() => pin.setPinnedSensor(pin.isSensorPinned(s.name) ? null : s.name)}
                  className={`absolute top-1.5 right-1.5 text-sm ${pin.isSensorPinned(s.name) ? "text-blue-400" : "text-gray-600 hover:text-gray-400"}`}
                  title={pin.isSensorPinned(s.name) ? "取消釘選" : "釘選到首頁"}
                >📌</button>
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

      {/* Device Cards */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">📌 釘選最多 {pin.MAX_PINNED_DEVICES} 個到首頁（已選 {pin.pinnedDevices.length}）</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {controllable.map((device) => (
          <div
            key={device.name}
            ref={(el) => { deviceRefs.current[device.name] = el; }}
            className="transition-all duration-300"
          >
            <Card className={pin.isDevicePinned(device.name) ? "border-blue-500/30" : ""}>
              <CardHeader>
                <CardTitle>
                  {deviceIcons[device.type] ?? "📱"} {device.name}
                  {device.location && <span className="ml-2 text-xs font-normal text-gray-500">{device.location}</span>}
                </CardTitle>
                <button
                  onClick={() => pin.togglePinDevice(device.name)}
                  disabled={!pin.isDevicePinned(device.name) && !pin.canPinMore}
                  className={`text-sm transition-colors ${pin.isDevicePinned(device.name) ? "text-blue-400" : pin.canPinMore ? "text-gray-600 hover:text-gray-400" : "text-gray-700 cursor-not-allowed"}`}
                  title={pin.isDevicePinned(device.name) ? "取消釘選" : pin.canPinMore ? "釘選到首頁" : `已達上限 ${pin.MAX_PINNED_DEVICES} 個`}
                >📌</button>
              </CardHeader>

              {/* AC */}
              {device.type === "空調" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400">電源</label>
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => updateAcPending({ power: true })}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${acPending.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>ON</button>
                      <button onClick={() => updateAcPending({ power: false })}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${!acPending.power ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>OFF</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">溫度</label>
                    <div className="mt-1 flex items-center gap-3">
                      <button onClick={() => updateAcPending({ temperature: Math.max(options.ac.temperature.min, acPending.temperature - 1) })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">−</button>
                      <span className="w-16 text-center text-xl font-bold">{acPending.temperature}°C</span>
                      <button onClick={() => updateAcPending({ temperature: Math.min(options.ac.temperature.max, acPending.temperature + 1) })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">模式</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {options.ac.modes.map((m) => (
                        <button key={m.value} onClick={() => updateAcPending({ mode: m.value })}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${acPending.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">風速</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {options.ac.fan_speeds.map((s) => (
                        <button key={s.value} onClick={() => updateAcPending({ fanSpeed: s.value })}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${acPending.fanSpeed === s.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{s.label}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={sendAcCommand} disabled={sending}
                    className={`w-full rounded-lg py-2.5 text-sm font-bold transition-colors ${acDirty ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-700 text-gray-400"}`}>
                    {sending ? "送出中..." : acDirty ? "送出設定" : "未變更"}
                  </button>
                  <p className="text-xs text-gray-500">調整上方設定後按「送出」，才會實際發送 IR 指令</p>
                </div>
              )}

              {/* Dehumidifier */}
              {device.type === "除濕機" && (() => {
                const isPending = (type: string, value: unknown) =>
                  dhPending?.type === type && dhPending?.value === value;
                const isFailed = (type: string, value: unknown) =>
                  dhFailed?.type === type && dhFailed?.value === value;
                const btnClass = (type: string, value: unknown, isActive: boolean) =>
                  `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isFailed(type, value) ? "bg-red-500 text-white animate-pulse"
                    : isPending(type, value) ? "bg-amber-500 text-white animate-pulse"
                    : isActive ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`;
                return (
                <div className="space-y-4">
                  {device.power !== undefined && (
                    <p className="text-xs text-gray-400">
                      目前狀態：{device.power ? "🟢 運轉中" : "⚪ 關閉"}
                      {device.mode && ` · ${device.mode}`}
                      {device.targetHumidity && ` · 目標 ${device.targetHumidity}%`}
                    </p>
                  )}
                  <div>
                    <label className="text-xs text-gray-400">電源</label>
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => sendDehumidifierCommand(device.name, { power: true })} disabled={sending}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                          isFailed("power", true) ? "bg-red-500 text-white animate-pulse"
                          : isPending("power", true) ? "bg-amber-500 text-white animate-pulse"
                          : device.power ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}>ON</button>
                      <button onClick={() => sendDehumidifierCommand(device.name, { power: false })} disabled={sending}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                          isFailed("power", false) ? "bg-red-500 text-white animate-pulse"
                          : isPending("power", false) ? "bg-amber-500 text-white animate-pulse"
                          : device.power === false ? "bg-red-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}>OFF</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">模式</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {options.dehumidifier.modes.map((m) => (
                        <button key={m.value} onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })} disabled={sending}
                          className={btnClass("mode", m.value, device.mode === m.label)}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">目標濕度</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {options.dehumidifier.humidity.map((h) => (
                        <button key={h} onClick={() => sendDehumidifierCommand(device.name, { humidity: h })} disabled={sending}
                          className={btnClass("humidity", h, device.targetHumidity === h)}>{h}%</button>
                      ))}
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* IR - buttons from Sheet */}
              {device.type === "IR" && (
                <div>
                  <label className="text-xs text-gray-400">遙控按鈕</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(device.buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map((btn) => (
                      <button key={btn} onClick={() => sendIrCommand(device.name, btn)}
                        className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors">{btn}</button>
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
  );
}
