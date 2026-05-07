"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Activity, Cpu } from "lucide-react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import {
  DeviceData,
  DeviceOptions,
  DEFAULT_OPTIONS,
  DEVICE_ICONS,
  DEVICE_ICON_FALLBACK,
} from "@/lib/types";
import {
  PinButton,
  ClimateReadout,
  PANEL_BASE,
} from "@/components/ui/device-controls";
import { DeviceController } from "@/components/ui/device-controller";
import { ComputerCard } from "@/components/devices/computer-card";
import { SensorChart } from "@/components/devices/sensor-chart";
import type { ComputerPC } from "@/lib/computer";
import { type Sensor, computeSensorDomains } from "@/lib/sensor";

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

  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const sensors = devices.filter(d => d.type === "感應器");
  const controllable = devices.filter(d => d.type !== "感應器");

  // PC 監控：從 home-butler in-memory ring buffer 拉，agent 每 60s push 一次。
  // 60 秒 auto-refetch 跟 agent push 節奏對齊（最差 stale 約 60-120s）。
  const {
    data: computersMap,
    refetch: refetchComputers,
  } = useCachedFetch<Record<string, ComputerPC>>("/api/computers/status", {});
  useEffect(() => {
    const id = setInterval(() => refetchComputers(), 60_000);
    return () => clearInterval(id);
  }, [refetchComputers]);
  const computers = Object.values(computersMap).sort((a, b) => a.ip.localeCompare(b.ip));

  // 感測器歷史：home-butler 內部 polling 累積。
  const {
    data: sensorsMap,
    refetch: refetchSensors,
  } = useCachedFetch<Record<string, Sensor>>("/api/sensors/status", {});
  useEffect(() => {
    const id = setInterval(() => refetchSensors(), 60_000);
    return () => clearInterval(id);
  }, [refetchSensors]);
  // 跨所有感測器算共用 Y 範圍，三張卡的圖視覺對齊
  const sensorDomains = computeSensorDomains(Object.values(sensorsMap));

  // 跨所有 PC 算共用溫度 Y 範圍（含 history + current 的 cpu/gpu 溫度）。
  // round 到 5°C 整數 + ±5 buffer，避免線貼邊界、且 tick 看起來整齊。
  // 沒任何溫度資料時 fallback 30~90（合理的 PC 溫度區間）。
  const tempDomain: [number, number] = (() => {
    const temps: number[] = [];
    for (const c of computers) {
      for (const p of c.history) {
        if (p.cpu_temp_c != null) temps.push(p.cpu_temp_c);
        if (p.gpu_temp_c != null) temps.push(p.gpu_temp_c);
      }
      if (c.current?.cpu_temp_c != null) temps.push(c.current.cpu_temp_c);
      if (c.current?.gpu_temp_c != null) temps.push(c.current.gpu_temp_c);
    }
    if (temps.length === 0) return [30, 90];
    const lo = Math.floor(Math.min(...temps) / 5) * 5 - 5;
    const hi = Math.ceil(Math.max(...temps) / 5) * 5 + 5;
    return [lo, hi];
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense>
        <DeviceScrollTarget deviceRefs={deviceRefs} />
      </Suspense>

      {/* ── 環境感測 ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <Activity className="h-5 w-5 text-mute" strokeWidth={2} />
          環境感測
        </h1>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-mute">
            釘選 1 個到首頁{pin.pinnedSensor ? "（已選 1）" : "（未選）"}
          </p>
          {pin.pinnedSensor && (
            <button
              onClick={() => pin.setPinnedSensor(null)}
              className="text-xs text-warm hover:text-warm/80"
            >
              重置釘選
            </button>
          )}
        </div>

        {sensors.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((s) => {
              const pinned = pin.isSensorPinned(s.name);
              const SensorIcon = DEVICE_ICONS["感應器"] ?? DEVICE_ICON_FALLBACK;
              return (
                <div key={s.name} className={PANEL_BASE}>
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-4 w-4 place-items-center text-mute">
                        <SensorIcon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {s.location || s.name}
                      </span>
                    </div>
                    <PinButton
                      pinned={pinned}
                      onClick={() => pin.setPinnedSensor(pinned ? null : s.name)}
                      title={pinned ? "已釘選至首頁" : "釘選至首頁"}
                    />
                  </div>
                  <ClimateReadout temp={s.temperature} humidity={s.humidity} size="md" />
                  {sensorsMap[s.name] && sensorsMap[s.name].history.length > 0 ? (
                    <SensorChart
                      history={sensorsMap[s.name].history}
                      tempDomain={sensorDomains.tempDomain}
                      humDomain={sensorDomains.humDomain}
                    />
                  ) : (
                    <p className="px-1 text-xs text-mute">等待 24h 資料累積...</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : loading ? (
          <p className="px-1 text-sm text-mute">載入中...</p>
        ) : (
          <p className="px-1 text-sm text-mute">未偵測到感測器</p>
        )}
      </section>

      {/* ── 裝置控制 ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <LayoutGrid className="h-5 w-5 text-mute" strokeWidth={2} />
          裝置控制
        </h1>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-mute">
            釘選最多 {pin.MAX_PINNED_DEVICES} 個到首頁（已選 {pin.pinnedDevices.length}）
          </p>
          {pin.pinnedDevices.length > 0 && (
            <button
              onClick={pin.clearAllDevices}
              className="text-xs text-warm hover:text-warm/80"
            >
              重置釘選
            </button>
          )}
        </div>

      {/* 房間分群 + panel */}
      {(() => {
        const groups: Record<string, DeviceData[]> = {};
        controllable.forEach(d => {
          const loc = d.location || "其他";
          if (!groups[loc]) groups[loc] = [];
          groups[loc].push(d);
        });

        return Object.entries(groups).map(([location, devs]) => (
          <div key={location} className="space-y-3">
            <h2 className="px-1 pt-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-mute">
              {location}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {devs.map((device) => {
                const TypeIcon = DEVICE_ICONS[device.type] ?? DEVICE_ICON_FALLBACK;
                const pinned = pin.isDevicePinned(device.name);
                const canPin = pinned || pin.canPinMore;

                return (
                  <div
                    key={device.name}
                    ref={(el) => { deviceRefs.current[device.name] = el; }}
                    className={PANEL_BASE}
                  >
                    {/* panel-head */}
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid h-4 w-4 place-items-center text-mute">
                          <TypeIcon className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                        <span className="truncate text-sm font-semibold text-foreground">{device.name}</span>
                      </div>
                      <PinButton
                        pinned={pinned}
                        disabled={!canPin}
                        onClick={() => pin.togglePinDevice(device.name)}
                        title={pinned ? "已釘選至首頁" : canPin ? "釘選至首頁" : `已達上限 ${pin.MAX_PINNED_DEVICES} 個`}
                      />
                    </div>

                    <DeviceController
                      device={device}
                      options={options}
                      onAcCommandSuccess={fetchDevices}
                      onDehumidifierCommandSuccess={refetchStatus}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}
      </section>

      {/* ── 電腦 ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <Cpu className="h-5 w-5 text-mute" strokeWidth={2} />
          電腦
        </h1>
        {computers.length === 0 ? (
          <p className="px-1 text-sm text-mute">目前沒有電腦在線（agent 啟動後會自動出現）</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {computers.map((c) => (
              <ComputerCard key={c.ip} pc={c} tempDomain={tempDomain} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
