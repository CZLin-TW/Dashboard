"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Thermometer, Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import {
  AcPendingState,
  DeviceData,
  DeviceOptions,
  DEFAULT_OPTIONS,
  DEVICE_ICONS,
  DEVICE_ICON_FALLBACK,
  acPendingFromDevice,
} from "@/components/home/types";

/** 小圓點當運轉狀態指示，比 emoji 一致，跟 palette 對齊。 */
function StatusDot({ tone }: { tone: "running" | "waiting" | "off" }) {
  const cls = tone === "running" ? "bg-emerald-500" : tone === "waiting" ? "bg-amber-500 animate-pulse" : "bg-mute/40";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

function DeviceScrollTarget({ deviceRefs }: { deviceRefs: React.RefObject<Record<string, HTMLDivElement | null>> }) {
  const searchParams = useSearchParams();
  const targetDevice = searchParams.get("target");

  useEffect(() => {
    if (targetDevice && deviceRefs.current?.[targetDevice]) {
      deviceRefs.current[targetDevice]?.scrollIntoView({ behavior: "smooth", block: "center" });
      const el = deviceRefs.current[targetDevice];
      if (el) {
        el.classList.add("ring-2", "ring-cool");
        setTimeout(() => el.classList.remove("ring-2", "ring-cool"), 2000);
      }
    }
  }, [targetDevice, deviceRefs]);

  return null;
}

interface DashboardPayload {
  devices: DeviceData[];
  options: DeviceOptions;
}

export default function DevicesPage() {
  const { data: dashboard, loading, refetch: fetchDevices } = useCachedFetch<DashboardPayload | null>("/api/dashboard", null);
  const { data: liveStatus, refetch: refetchStatus } = useCachedFetch<Record<string, Partial<DeviceData>>>("/api/devices/status", {});
  const rawDevices = dashboard?.devices ?? [];
  const options = dashboard?.options ?? DEFAULT_OPTIONS;
  const devices = rawDevices.map(d => ({ ...d, ...(liveStatus[d.name] ?? {}) }));
  const pin = usePinnedDevices();
  const allDevices = devices;

  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [acPendingMap, setAcPendingMap] = useState<Record<string, AcPendingState>>({});
  const [acDirtyMap, setAcDirtyMap] = useState<Record<string, boolean>>({});
  const [acFailedMap, setAcFailedMap] = useState<Record<string, boolean>>({});
  const [acWaitingMap, setAcWaitingMap] = useState<Record<string, boolean>>({});
  const [acSendingMap, setAcSendingMap] = useState<Record<string, boolean>>({});

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
    setAcSendingMap((prev) => ({ ...prev, [device.name]: true }));
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
      setAcDirtyMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
      setAcWaitingMap((prev) => ({ ...prev, [device.name]: true }));
      await fetchDevices();
      setAcPendingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
      setAcWaitingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
    } catch (err) {
      console.error(`[sendAcCommand] ${device.name} network error:`, err);
      flashAcFailed(device.name);
      setAcWaitingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
    } finally {
      setAcSendingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
    }
  }

  async function sendDehumidifierCommand(deviceName: string, params: Record<string, unknown>) {
    const expected: { type: string; value: unknown } =
      params.power !== undefined ? { type: "power", value: params.power } :
      params.mode !== undefined ? { type: "mode", value: params.mode } :
      { type: "humidity", value: params.humidity };

    setDhPending(expected);
    setDhFailed(null);

    try {
      await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, action: "dehumidifier", params }),
      });

      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
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
              refetchStatus();
              return;
            }
          }
        } catch { /* continue polling */ }
      }

      setDhPending(null);
      setDhFailed(expected);
      setTimeout(() => setDhFailed(null), 2000);
      refetchStatus();
    } catch {
      setDhPending(null);
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense>
        <DeviceScrollTarget deviceRefs={deviceRefs} />
      </Suspense>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <LayoutGrid className="h-6 w-6" strokeWidth={2} />
        裝置控制
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Thermometer className="h-4 w-4" strokeWidth={2} />
            環境感測器
          </CardTitle>
          <span className="text-xs text-mute">釘選 1 個到首頁</span>
        </CardHeader>
        {sensors.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sensors.map((s) => (
              <div key={s.name} className={`relative rounded-lg p-3 text-center transition-colors ${pin.isSensorPinned(s.name) ? "bg-cool/10 border border-cool/30" : "bg-elevated/50"}`}>
                <button
                  onClick={() => pin.setPinnedSensor(pin.isSensorPinned(s.name) ? null : s.name)}
                  className={`absolute top-1.5 right-1.5 transition-colors ${pin.isSensorPinned(s.name) ? "text-fresh" : "text-mute/60 hover:text-mute"}`}
                  title={pin.isSensorPinned(s.name) ? "取消釘選" : "釘選到首頁"}
                >
                  <Pin
                    className="h-4 w-4"
                    strokeWidth={2}
                    fill={pin.isSensorPinned(s.name) ? "currentColor" : "none"}
                  />
                </button>
                <p className="text-xs text-mute mb-1">{s.location || s.name}</p>
                <span className="text-xl font-bold">{s.temperature ?? "--"}°C</span>
                <p className="text-sm text-mute">{s.humidity ?? "--"}%</p>
              </div>
            ))}
          </div>
        ) : loading ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : (
          <p className="text-sm text-mute">未偵測到感測器</p>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-mute">釘選最多 {pin.MAX_PINNED_DEVICES} 個到首頁（已選 {pin.pinnedDevices.length}）</p>
        {(pin.pinnedDevices.length > 0 || pin.pinnedSensor) && (
          <button onClick={pin.resetAll} className="text-xs text-warm hover:text-warm/80">重置釘選</button>
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
          `rounded px-2.5 py-1 text-xs font-medium transition-colors ${isFailed(type, value) ? "bg-warm text-white animate-pulse" : isPending(type, value) ? "bg-amber-500 text-white animate-pulse" : isActive ? "bg-cool text-white" : "bg-elevated text-soft hover:bg-mute/20"}`;

        return Object.entries(groups).map(([location, devs]) => (
          <div key={location} className="space-y-3">
            <h2 className="text-sm font-semibold text-mute border-b border-mute/15 pb-1">{location}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {devs.map((device) => (
                <div key={device.name} ref={(el) => { deviceRefs.current[device.name] = el; }}>
                  <Card className={pin.isDevicePinned(device.name) ? "border-cool/30" : ""}>
                    <CardHeader>
                      {(() => {
                        const TypeIcon = DEVICE_ICONS[device.type] ?? DEVICE_ICON_FALLBACK;
                        return (
                          <CardTitle className="flex items-center gap-1.5">
                            <TypeIcon className="h-4 w-4" strokeWidth={2} />
                            {device.name}
                          </CardTitle>
                        );
                      })()}
                      <button
                        onClick={() => pin.togglePinDevice(device.name)}
                        disabled={!pin.isDevicePinned(device.name) && !pin.canPinMore}
                        className={`transition-colors ${pin.isDevicePinned(device.name) ? "text-fresh" : pin.canPinMore ? "text-mute/60 hover:text-mute" : "text-mute/40 cursor-not-allowed"}`}
                        title={pin.isDevicePinned(device.name) ? "取消釘選" : pin.canPinMore ? "釘選到首頁" : `已達上限 ${pin.MAX_PINNED_DEVICES} 個`}
                      >
                        <Pin
                          className="h-4 w-4"
                          strokeWidth={2}
                          fill={pin.isDevicePinned(device.name) ? "currentColor" : "none"}
                        />
                      </button>
                    </CardHeader>

                    {device.type === "空調" && (() => {
                      const pending = getAcPending(device);
                      const dirty = !!acDirtyMap[device.name];
                      const failed = !!acFailedMap[device.name];
                      const waiting = !!acWaitingMap[device.name];
                      const sending = !!acSendingMap[device.name];
                      const lastTime = device.lastUpdatedAt ? (device.lastUpdatedAt.split(" ")[1] || device.lastUpdatedAt) : "";
                      return (
                      <div className="space-y-3">
                        {(device.lastPower || waiting) ? (
                          <p className="flex items-center gap-1.5 text-xs text-mute">
                            目前：
                            {waiting ? (
                              <><StatusDot tone="waiting" />{pending.power ? (
                                <>{pending.temperature !== undefined && ` ${pending.temperature}°C`}{pending.mode && ` ${pending.mode}`}{pending.fanSpeed && ` ${pending.fanSpeed}`}</>
                              ) : " 關閉"}</>
                            ) : device.lastPower === "on" ? (
                              <><StatusDot tone="running" /> {device.lastTemperature !== undefined && device.lastTemperature !== "" && `${device.lastTemperature}°C`}{device.lastMode && ` ${device.lastMode}`}{device.lastFanSpeed && ` ${device.lastFanSpeed}`}</>
                            ) : (
                              <><StatusDot tone="off" /> 關閉</>
                            )}
                            {lastTime && ` · ${lastTime}`}
                          </p>
                        ) : (
                          <p className="text-xs text-mute">尚無使用記錄</p>
                        )}
                        <div><label className="text-xs text-mute">電源</label><div className="mt-1 flex gap-2"><button onClick={() => updateAcPending(device, { power: true })} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${pending.power ? "bg-cool text-white" : "bg-elevated text-soft hover:bg-mute/20"}`}>ON</button><button onClick={() => updateAcPending(device, { power: false })} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${!pending.power ? "bg-warm text-white" : "bg-elevated text-soft hover:bg-mute/20"}`}>OFF</button></div></div>
                        <div><label className="text-xs text-mute">溫度</label><div className="mt-1 flex items-center gap-2"><button onClick={() => updateAcPending(device, { temperature: Math.max(options.ac.temperature.min, pending.temperature - 1) })} className="flex h-7 w-7 items-center justify-center rounded bg-elevated hover:bg-mute/20 text-sm">−</button><span className="w-14 text-center font-bold">{pending.temperature}°C</span><button onClick={() => updateAcPending(device, { temperature: Math.min(options.ac.temperature.max, pending.temperature + 1) })} className="flex h-7 w-7 items-center justify-center rounded bg-elevated hover:bg-mute/20 text-sm">+</button></div></div>
                        <div><label className="text-xs text-mute">模式</label><div className="mt-1 flex flex-wrap gap-1.5">{options.ac.modes.map((m) => (<button key={m.value} onClick={() => updateAcPending(device, { mode: m.value })} className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${pending.mode === m.value ? "bg-cool text-white" : "bg-elevated text-soft hover:bg-mute/20"}`}>{m.label}</button>))}</div></div>
                        <div><label className="text-xs text-mute">風速</label><div className="mt-1 flex flex-wrap gap-1.5">{options.ac.fan_speeds.map((s) => (<button key={s.value} onClick={() => updateAcPending(device, { fanSpeed: s.value })} className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${pending.fanSpeed === s.value ? "bg-cool text-white" : "bg-elevated text-soft hover:bg-mute/20"}`}>{s.label}</button>))}</div></div>
                        <button onClick={() => sendAcCommand(device)} disabled={sending} className={`w-full rounded-lg py-2 text-sm font-bold transition-colors ${failed ? "bg-warm text-white animate-pulse" : dirty ? "bg-fresh text-white hover:bg-fresh/85" : "bg-elevated text-mute"}`}>{failed ? "失敗，請重試" : sending ? "送出中..." : dirty ? "送出設定" : "未變更"}</button>
                      </div>
                      );
                    })()}

                    {device.type === "除濕機" && (
                      <div className="space-y-3">
                        {device.power !== undefined && (
                          <p className="flex items-center gap-1.5 text-xs text-mute">
                            目前：<StatusDot tone={device.power ? "running" : "off"} />
                            {device.power ? "運轉中" : "關閉"}
                            {device.mode && ` · ${device.mode}`}
                            {device.targetHumidity && ` · 目標 ${device.targetHumidity}`}
                          </p>
                        )}
                        <div><label className="text-xs text-mute">電源</label><div className="mt-1 flex gap-2"><button onClick={() => sendDehumidifierCommand(device.name, { power: true })} disabled={dhPending !== null} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${isFailed("power", true) ? "bg-warm text-white animate-pulse" : isPending("power", true) ? "bg-amber-500 text-white animate-pulse" : device.power ? "bg-cool text-white" : "bg-elevated text-soft hover:bg-mute/20"}`}>ON</button><button onClick={() => sendDehumidifierCommand(device.name, { power: false })} disabled={dhPending !== null} className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${isFailed("power", false) ? "bg-warm text-white animate-pulse" : isPending("power", false) ? "bg-amber-500 text-white animate-pulse" : device.power === false ? "bg-warm text-white" : "bg-elevated text-soft hover:bg-mute/20"}`}>OFF</button></div></div>
                        <div><label className="text-xs text-mute">模式</label><div className="mt-1 flex flex-wrap gap-1.5">{options.dehumidifier.modes.map((m) => (<button key={m.value} onClick={() => sendDehumidifierCommand(device.name, { mode: m.value })} disabled={dhPending !== null} className={btnClass("mode", m.value, device.mode === m.label)}>{m.label}</button>))}</div></div>
                        <div><label className="text-xs text-mute">目標濕度</label><div className="mt-1 flex flex-wrap gap-1.5">{options.dehumidifier.humidity.map((h) => (<button key={h} onClick={() => sendDehumidifierCommand(device.name, { humidity: h })} disabled={dhPending !== null} className={btnClass("humidity", h, String(device.targetHumidity) === `${h}%`)}>{h}%</button>))}</div></div>
                      </div>
                    )}

                    {device.type === "IR" && (
                      <div>
                        <label className="text-xs text-mute">遙控按鈕</label>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {(device.buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map((btn) => (
                            <button key={btn} onClick={() => sendIrCommand(device.name, btn)} className="rounded-lg bg-elevated px-3 py-1.5 text-sm font-medium text-soft hover:bg-mute/20 active:bg-mute/30 transition-colors">{btn}</button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-mute">IR 遙控為單向發送，不會回傳裝置狀態</p>
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
