"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

interface AcPendingState {
  power: boolean;
  temperature: number;
  mode: string;
  fanSpeed: string;
}

interface DeviceState {
  id: string;
  name: string;
  type: "ac" | "dehumidifier" | "ir";
  icon: string;
  detail: string;
  temperature?: number;
  mode?: string;
  fanSpeed?: string;
  humidity?: number;
  active?: boolean;
  buttons?: { key: string; label: string }[];
}

const initialDevices: DeviceState[] = [
  {
    id: "ac",
    name: "客廳冷氣",
    type: "ac",
    icon: "❄️",
    detail: "冷氣模式",
    temperature: 26,
    mode: "cool",
    fanSpeed: "auto",
    active: true,
  },
  {
    id: "dehumidifier",
    name: "除濕機",
    type: "dehumidifier",
    icon: "💨",
    detail: "自動模式",
    mode: "auto",
    humidity: 60,
    active: true,
  },
  {
    id: "fan",
    name: "電扇",
    type: "ir",
    icon: "🌀",
    detail: "IR 遙控",
    buttons: [
      { key: "power", label: "電源" },
      { key: "speed", label: "風速" },
      { key: "swing", label: "擺頭" },
      { key: "timer", label: "定時" },
    ],
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
  const [devices, setDevices] = useState(initialDevices);
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // AC: pending state for staging before send
  const acDevice = devices.find((d) => d.type === "ac");
  const [acPending, setAcPending] = useState<AcPendingState>({
    power: acDevice?.active ?? false,
    temperature: acDevice?.temperature ?? 26,
    mode: acDevice?.mode ?? "cool",
    fanSpeed: acDevice?.fanSpeed ?? "auto",
  });
  const [acDirty, setAcDirty] = useState(false);

  function updateAcPending(updates: Partial<AcPendingState>) {
    setAcPending((prev) => ({ ...prev, ...updates }));
    setAcDirty(true);
  }

  function sendAcCommand() {
    // TODO: Call SwitchBot API to send full AC state
    console.log("Sending AC command:", acPending);
    // Update displayed state to match what was sent
    setDevices((prev) =>
      prev.map((d) =>
        d.type === "ac"
          ? { ...d, active: acPending.power, temperature: acPending.temperature, mode: acPending.mode, fanSpeed: acPending.fanSpeed }
          : d
      )
    );
    setAcDirty(false);
  }

  function updateDevice(index: number, updates: Partial<DeviceState>) {
    setDevices((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...updates } : d))
    );
  }

  function sendIrCommand(deviceName: string, button: string) {
    // TODO: Call SwitchBot API to send IR command
    console.log(`Sending IR command: ${deviceName} \u2192 ${button}`);
  }

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
          <div
            key={device.id}
            ref={(el) => { deviceRefs.current[device.id] = el; }}
            className="transition-all duration-300"
          >
            <Card className={device.active ? "border-blue-500/30" : ""}>
              <CardHeader>
                <CardTitle>
                  {device.icon} {device.name}
                </CardTitle>
                {device.type === "dehumidifier" && (
                  <button
                    onClick={() => updateDevice(index, { active: !device.active })}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      device.active
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {device.active ? "ON" : "OFF"}
                  </button>
                )}
              </CardHeader>

              {device.type === "ac" && (
                <div className="space-y-4">
                  {/* Power */}
                  <div>
                    <label className="text-xs text-gray-400">電源</label>
                    <div className="mt-1 flex gap-2">
                      <button
                        onClick={() => updateAcPending({ power: true })}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                          acPending.power
                            ? "bg-blue-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        ON
                      </button>
                      <button
                        onClick={() => updateAcPending({ power: false })}
                        className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                          !acPending.power
                            ? "bg-red-600 text-white"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        }`}
                      >
                        OFF
                      </button>
                    </div>
                  </div>
                  {/* Temperature */}
                  <div>
                    <label className="text-xs text-gray-400">溫度</label>
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        onClick={() => updateAcPending({ temperature: Math.max(16, acPending.temperature - 1) })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600"
                      >
                        −
                      </button>
                      <span className="w-16 text-center text-xl font-bold">{acPending.temperature}°C</span>
                      <button
                        onClick={() => updateAcPending({ temperature: Math.min(30, acPending.temperature + 1) })}
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
                          onClick={() => updateAcPending({ mode: m.value })}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            acPending.mode === m.value
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
                          onClick={() => updateAcPending({ fanSpeed: s.value })}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            acPending.fanSpeed === s.value
                              ? "bg-blue-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Send Button */}
                  <button
                    onClick={sendAcCommand}
                    className={`w-full rounded-lg py-2.5 text-sm font-bold transition-colors ${
                      acDirty
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {acDirty ? "送出設定" : "未變更"}
                  </button>
                  <p className="text-xs text-gray-500">
                    調整上方設定後按「送出」，才會實際發送 IR 指令
                  </p>
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

              {!device.active && device.type === "dehumidifier" && (
                <p className="text-sm text-gray-500">裝置已關閉</p>
              )}

              {device.type === "ir" && device.buttons && (
                <div>
                  <label className="text-xs text-gray-400">遙控按鈕</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {device.buttons.map((btn) => (
                      <button
                        key={btn.key}
                        onClick={() => sendIrCommand(device.name, btn.key)}
                        className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 active:bg-gray-500 transition-colors"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    IR 遙控為單向發送，不會回傳裝置狀態
                  </p>
                </div>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
