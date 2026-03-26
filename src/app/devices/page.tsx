"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface DeviceState {
  name: string;
  type: "ac" | "dehumidifier" | "ir";
  icon: string;
  active: boolean;
  detail: string;
  temperature?: number;
  mode?: string;
  fanSpeed?: string;
  humidity?: number;
}

const initialDevices: DeviceState[] = [
  {
    name: "客廳冷氣",
    type: "ac",
    icon: "❄️",
    active: true,
    detail: "冷氣模式",
    temperature: 26,
    mode: "cool",
    fanSpeed: "auto",
  },
  {
    name: "除濕機",
    type: "dehumidifier",
    icon: "💨",
    active: true,
    detail: "自動模式",
    mode: "auto",
    humidity: 60,
  },
  {
    name: "電扇",
    type: "ir",
    icon: "🌀",
    active: false,
    detail: "",
  },
  {
    name: "音響",
    type: "ir",
    icon: "🔊",
    active: false,
    detail: "",
  },
];

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

export default function DevicesPage() {
  const [devices, setDevices] = useState(initialDevices);

  function toggleDevice(index: number) {
    setDevices((prev) =>
      prev.map((d, i) => (i === index ? { ...d, active: !d.active } : d))
    );
  }

  function updateDevice(index: number, updates: Partial<DeviceState>) {
    setDevices((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...updates } : d))
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">📱 裝置控制</h1>

      {/* Sensor */}
      <Card>
        <CardHeader>
          <CardTitle>🌡️ 環境感測器</CardTitle>
        </CardHeader>
        <div className="flex gap-8">
          <div>
            <span className="text-sm text-gray-400">溫度</span>
            <p className="text-2xl font-bold">27.5°C</p>
          </div>
          <div>
            <span className="text-sm text-gray-400">濕度</span>
            <p className="text-2xl font-bold">65%</p>
          </div>
        </div>
      </Card>

      {/* Device Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {devices.map((device, index) => (
          <Card key={device.name} className={device.active ? "border-blue-500/30" : ""}>
            <CardHeader>
              <CardTitle>
                {device.icon} {device.name}
              </CardTitle>
              <button
                onClick={() => toggleDevice(index)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  device.active
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {device.active ? "ON" : "OFF"}
              </button>
            </CardHeader>

            {device.active && device.type === "ac" && (
              <div className="space-y-4">
                {/* Temperature */}
                <div>
                  <label className="text-xs text-gray-400">溫度</label>
                  <div className="mt-1 flex items-center gap-3">
                    <button
                      onClick={() => updateDevice(index, { temperature: Math.max(16, (device.temperature ?? 26) - 1) })}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600"
                    >
                      −
                    </button>
                    <span className="w-16 text-center text-xl font-bold">{device.temperature}°C</span>
                    <button
                      onClick={() => updateDevice(index, { temperature: Math.min(30, (device.temperature ?? 26) + 1) })}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600"
                    >
                      +
                    </button>
                  </div>
                </div>
                {/* Mode */}
                <div>
                  <label className="text-xs text-gray-400">模式</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {AC_MODES.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => updateDevice(index, { mode: m.value })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          device.mode === m.value
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Fan Speed */}
                <div>
                  <label className="text-xs text-gray-400">風速</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {FAN_SPEEDS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => updateDevice(index, { fanSpeed: s.value })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          device.fanSpeed === s.value
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {device.active && device.type === "dehumidifier" && (
              <div className="space-y-4">
                {/* Mode */}
                <div>
                  <label className="text-xs text-gray-400">模式</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {DEHUMIDIFIER_MODES.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => updateDevice(index, { mode: m.value })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          device.mode === m.value
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Target Humidity */}
                <div>
                  <label className="text-xs text-gray-400">目標濕度</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {[40, 45, 50, 55, 60, 65, 70].map((h) => (
                      <button
                        key={h}
                        onClick={() => updateDevice(index, { humidity: h })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          device.humidity === h
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        {h}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {device.active && device.type === "ir" && (
              <p className="text-sm text-gray-400">IR 遙控裝置 — 點擊 ON/OFF 切換電源</p>
            )}

            {!device.active && (
              <p className="text-sm text-gray-500">裝置已關閉</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
