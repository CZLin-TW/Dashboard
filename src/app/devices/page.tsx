"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

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
}

const AC_MODES = [
  { value: "cool", label: "冷氣" },
  { value: "heat", label: "暖氣" },
  { value: "auto", label: "自動" },
  { value: "dry", label: "除濕" },
  { value: "fan", label: "送風" },
];

const FAN_SPEEDS = [
  { value: "auto", label: "自動" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

const DEHUMIDIFIER_MODES = [
  { value: "auto", label: "自動" },
  { value: "continuous", label: "連續" },
  { value: "silent", label: "靜音" },
  { value: "eco", label: "省電" },
  { value: "air_purify", label: "淨化" },
];

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
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [acPending, setAcPending] = useState<AcPendingState>({
    power: false, temperature: 26, mode: "cool", fanSpeed: "auto",
  });
  const [acDirty, setAcDirty] = useState(false);

  const fetchDevices = useCallback(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDevices(data);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

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
        body: JSON.stringify({
          deviceName: ac.name,
          action: "setAll",
          params: acPending,
        }),
      });
      setAcDirty(false);
    } finally {
      setSending(false);
    }
  }

  async function sendDehumidifierCommand(deviceName: string, params: Record<string, unknown>) {
    setSending(true);
    try {
      await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, action: "dehumidifier", params }),
      });
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

  const sensor = devices.find(d => d.type === "感應器");
  const controllable = devices.filter(d => d.type !== "感應器");

  const deviceIcons: Record<string, string> = {
    "空調": "❄️", "IR": "🌀", "除濕機": "💨",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense>
        <DeviceScrollTarget deviceRefs={deviceRefs} />
      </Suspense>
      <h1 className="text-2xl font-bold">📱 裝置控制</h1>

      {/* Sensor */}
      <Card>
        <CardHeader>
          <CardTitle>🌡️ 環境感測器</CardTitle>
        </CardHeader>
        {sensor ? (
          <div className="flex gap-8">
            <div>
              <span className="text-sm text-gray-400">溫度</span>
              <p className="text-2xl font-bold">{sensor.temperature}°C</p>
            </div>
            <div>
              <span className="text-sm text-gray-400">濕度</span>
              <p className="text-2xl font-bold">{sensor.humidity}%</p>
            </div>
          </div>
        ) : loading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : (
          <p className="text-sm text-gray-500">未偵測到感測器</p>
        )}
      </Card>

      {/* Device Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {controllable.map((device) => (
          <div
            key={device.name}
            ref={(el) => { deviceRefs.current[device.name] = el; }}
            className="transition-all duration-300"
          >
            <Card>
              <CardHeader>
                <CardTitle>
                  {deviceIcons[device.type] ?? "📱"} {device.name}
                </CardTitle>
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
                      <button onClick={() => updateAcPending({ temperature: Math.max(16, acPending.temperature - 1) })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">−</button>
                      <span className="w-16 text-center text-xl font-bold">{acPending.temperature}°C</span>
                      <button onClick={() => updateAcPending({ temperature: Math.min(30, acPending.temperature + 1) })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">模式</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {AC_MODES.map((m) => (
                        <button key={m.value} onClick={() => updateAcPending({ mode: m.value })}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${acPending.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">風速</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {FAN_SPEEDS.map((s) => (
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
              {device.type === "除濕機" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400">電源</label>
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => sendDehumidifierCommand(device.name, { power: true })}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${device.power ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>ON</button>
                      <button onClick={() => sendDehumidifierCommand(device.name, { power: false })}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${device.power === false ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>OFF</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">模式</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {DEHUMIDIFIER_MODES.map((m) => (
                        <button key={m.value} onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${device.mode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">目標濕度</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {[40, 45, 50, 55, 60, 65, 70].map((h) => (
                        <button key={h} onClick={() => sendDehumidifierCommand(device.name, { humidity: h })}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${device.humidity === h ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>{h}%</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* IR */}
              {device.type === "IR" && (
                <div>
                  <label className="text-xs text-gray-400">遙控按鈕</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["電源", "風速", "擺頭", "定時"].map((btn) => (
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
