"use client";

import { useEffect, useMemo, useRef, Suspense } from "react";
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
import { generateComputerMock } from "@/lib/computer-mock";

// TODO: mockup — 之後接後端會改從 /api/computers 之類撈設定（含硬體型號由 agent 啟動時讀本機 spec）。
const COMPUTERS = [
  { ip: "192.168.68.53", cpuModel: "R5-7600X", gpuModel: "RTX-4070Ti" },
  { ip: "192.168.68.55", cpuModel: "Xeon-1230v2", gpuModel: "GTX-1650S" },
];

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

  // mockup 階段用假資料。useMemo 鎖定一次計算，避免每 render 重生 history（時間軸會跳動）。
  const computers = useMemo(
    () => COMPUTERS.map((c) => ({ ...c, ...generateComputerMock(c.ip) })),
    []
  );

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

      {/* ── 電腦（mockup） ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <Cpu className="h-5 w-5 text-mute" strokeWidth={2} />
          電腦
        </h1>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {computers.map((c) => (
            <ComputerCard
              key={c.ip}
              ip={c.ip}
              cpuModel={c.cpuModel}
              gpuModel={c.gpuModel}
              history={c.history}
              current={c.current}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
