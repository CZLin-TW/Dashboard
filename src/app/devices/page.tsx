"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Activity, Cpu } from "lucide-react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import {
  DeviceData,
  DeviceOptions,
  DehumidifierAutoRule,
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
import { ScheduleSection } from "@/components/devices/schedule-section";
import type { ComputerPC } from "@/lib/computer";
import type { TheaterFlagKey, TheaterSummary } from "@/lib/theater";
import { type Sensor, computeSensorDomains } from "@/lib/sensor";
import { type AcDevice, getAcSegmentsForLocation } from "@/lib/ac";
import { type DehumDevice, getDehumSegmentsForLocation } from "@/lib/dehumidifier";
import type { Schedule } from "@/lib/schedule";

function DeviceScrollTarget({
  deviceRefs,
}: {
  deviceRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
}) {
  const searchParams = useSearchParams();
  const targetDevice = searchParams.get("target");

  useEffect(() => {
    if (!targetDevice) return;
    const t = setTimeout(() => {
      const el = deviceRefs.current?.[targetDevice];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-cool");
        setTimeout(() => el.classList.remove("ring-2", "ring-cool"), 2000);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [targetDevice, deviceRefs]);

  return null;
}

interface DashboardPayload {
  devices: DeviceData[];
  options: DeviceOptions;
}

// 劇院 summary 的 localStorage cache key（版本前綴同 use-cached-fetch，bump 自動失效）
const THEATER_CACHE_KEY = `cache:${process.env.APP_VERSION}:/api/theater/summary`;

function saveTheaterCache(summary: TheaterSummary) {
  try {
    localStorage.setItem(THEATER_CACHE_KEY, JSON.stringify(summary));
  } catch { /* storage full, ignore */ }
}

export default function DevicesPage() {
  const { data: dashboard, loading } = useCachedFetch<DashboardPayload | null>("/api/dashboard", null);
  const { data: liveStatus, refetch: refetchStatus } = useCachedFetch<Record<string, Partial<DeviceData>>>("/api/devices/status", {});
  useAutoRefresh(refetchStatus);
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

  // 劇院 agent summary：不用 useCachedFetch——失敗時要明確標 offline（區塊變灰、
  // 開關鎖定），但要保留上次成功資料才知道區塊掛在哪張 PC 卡（agent_id = hostname）。
  const [theater, setTheater] = useState<TheaterSummary | null>(null);
  const [theaterOffline, setTheaterOffline] = useState(false);
  const [theaterRefreshing, setTheaterRefreshing] = useState(false);

  const refetchTheater = useCallback(async () => {
    setTheaterRefreshing(true);
    try {
      const r = await fetch("/api/theater/summary");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const fresh: TheaterSummary = await r.json();
      if (!fresh?.agent_id) throw new Error("missing agent_id");
      setTheater(fresh);
      setTheaterOffline(false);
      saveTheaterCache(fresh);
    } catch (err) {
      console.error("[theater] summary fetch failed:", err);
      setTheaterOffline(true);
    } finally {
      setTheaterRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // localStorage 還原：跟 use-cached-fetch 同一個 hydration trade-off（見該檔說明）
    try {
      const cached = localStorage.getItem(THEATER_CACHE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cached) setTheater(JSON.parse(cached));
    } catch { /* ignore */ }
    refetchTheater();
    const id = setInterval(() => refetchTheater(), 60_000);
    return () => clearInterval(id);
  }, [refetchTheater]);

  const setTheaterFlag = useCallback(async (key: TheaterFlagKey, value: boolean) => {
    // optimistic update；失敗 rollback（theater_agent 端開關生效要幾秒，樂觀顯示沒有風險）
    setTheater((prev) => (prev ? { ...prev, flags: { ...prev.flags, [key]: value } } : prev));
    try {
      const r = await fetch("/api/theater/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setTheater((prev) => {
        if (!prev) return prev;
        const next = data?.flags ? { ...prev, flags: data.flags } : prev;
        saveTheaterCache(next);
        return next;
      });
    } catch (err) {
      console.error("[theater] flag update failed:", err);
      setTheater((prev) => (prev ? { ...prev, flags: { ...prev.flags, [key]: !value } } : prev));
    }
  }, []);

  // 感測器歷史：home-butler 內部 polling 累積。
  const {
    data: sensorsMap,
    refetch: refetchSensors,
  } = useCachedFetch<Record<string, Sensor>>("/api/sensors/status", {});
  useEffect(() => {
    const id = setInterval(() => refetchSensors(), 60_000);
    return () => clearInterval(id);
  }, [refetchSensors]);

  // 除濕機自動規則：每台一份，key = device_name
  const {
    data: dehumRulesMap,
    refetch: refetchDehumRules,
  } = useCachedFetch<Record<string, DehumidifierAutoRule>>("/api/dehumidifier/auto-rule", {});
  useEffect(() => {
    const id = setInterval(() => refetchDehumRules(), 60_000);
    return () => clearInterval(id);
  }, [refetchDehumRules]);
  // 除濕機 ON/OFF 歷史：給自動模式 chart 畫背景綠色 on-segments
  const {
    data: dehumHistoryMap,
    refetch: refetchDehumHistory,
  } = useCachedFetch<Record<string, DehumDevice>>("/api/dehumidifier/history", {});
  useEffect(() => {
    const id = setInterval(() => refetchDehumHistory(), 60_000);
    return () => clearInterval(id);
  }, [refetchDehumHistory]);

  // 排程：每張裝置卡內嵌的 ScheduleSection 需要。/api/schedules 一次拿全部、
  // 各裝置卡自己 filter。
  const {
    data: schedules,
    refetch: refetchSchedules,
  } = useCachedFetch<Schedule[]>("/api/schedules", []);
  const schedulesByDevice = (() => {
    const map: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      const name = s["設備名稱"] ?? "";
      if (!name) continue;
      (map[name] ??= []).push(s);
    }
    return map;
  })();

  const availableSensorNames = Object.keys(sensorsMap);
  // 跨所有感測器算共用 Y 範圍，三張卡的圖視覺對齊
  const sensorDomains = computeSensorDomains(Object.values(sensorsMap));

  // 空調狀態歷史，給 sensor chart 背景畫 AC on 區段色塊
  const {
    data: acsMap,
    refetch: refetchAcs,
  } = useCachedFetch<Record<string, AcDevice>>("/api/ac/status", {});
  useEffect(() => {
    const id = setInterval(() => refetchAcs(), 60_000);
    return () => clearInterval(id);
  }, [refetchAcs]);

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
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <Activity className="h-4 w-4" strokeWidth={2} />
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
                      <span className="grid h-5 w-5 place-items-center text-mute">
                        <SensorIcon className="h-5 w-5" strokeWidth={1.8} />
                      </span>
                      <span className="truncate text-[22px] font-bold tracking-[-0.01em] text-foreground">
                        {s.name || s.location}
                      </span>
                    </div>
                    <PinButton
                      pinned={pinned}
                      onClick={() => pin.setPinnedSensor(pinned ? null : s.name)}
                      title={pinned ? "已釘選至首頁" : "釘選至首頁"}
                    />
                  </div>
                  <ClimateReadout
                    temp={s.temperature}
                    humidity={s.humidity}
                    co2={sensorsMap[s.name]?.current?.co2 ?? null}
                    size="md"
                  />
                  {sensorsMap[s.name] && sensorsMap[s.name].history.length > 0 ? (
                    <SensorChart
                      history={sensorsMap[s.name].history}
                      tempDomain={sensorDomains.tempDomain}
                      humDomain={sensorDomains.humDomain}
                      co2Domain={sensorsMap[s.name].history.some((p) => p.co2 != null) ? sensorDomains.co2Domain : null}
                      acSegments={getAcSegmentsForLocation(acsMap, s.location || "")}
                      dehumSegments={getDehumSegmentsForLocation(dehumHistoryMap, s.location || "")}
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
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <LayoutGrid className="h-4 w-4" strokeWidth={2} />
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

      {/* 房間分群：每個房間一個子標題，下方直接展開裝置 grid */}
      {(() => {
        const groups: Record<string, DeviceData[]> = {};
        controllable.forEach(d => {
          const loc = d.location || "其他";
          if (!groups[loc]) groups[loc] = [];
          groups[loc].push(d);
        });

        return Object.entries(groups).map(([location, devs]) => (
          <div key={location} className="space-y-3">
            {/* 房間子標題：對比樣式（uppercase + 細底線），跟新的 section h1（小灰字）不打架 */}
            <h2 className="border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wider text-mute">
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
                        <span className="grid h-5 w-5 place-items-center text-mute">
                          <TypeIcon className="h-5 w-5" strokeWidth={1.8} />
                        </span>
                        <span className="truncate text-[22px] font-bold tracking-[-0.01em] text-foreground">{device.name}</span>
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
                      onAcCommandSuccess={refetchStatus}
                      onDehumidifierCommandSuccess={refetchStatus}
                      dehumRule={device.type === "除濕機" ? (dehumRulesMap[device.name] ?? null) : undefined}
                      availableSensors={device.type === "除濕機" ? availableSensorNames : undefined}
                      onDehumRuleUpdate={refetchDehumRules}
                      sensorsMap={device.type === "除濕機" ? sensorsMap : undefined}
                      dehumHistoryMap={device.type === "除濕機" ? dehumHistoryMap : undefined}
                    />

                    <ScheduleSection
                      device={device}
                      options={options}
                      schedules={schedulesByDevice[device.name] ?? []}
                      allDevices={controllable}
                      onSchedulesChange={refetchSchedules}
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
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <Cpu className="h-4 w-4" strokeWidth={2} />
          電腦
        </h1>
        {computers.length === 0 ? (
          <p className="px-1 text-sm text-mute">目前沒有電腦在線（agent 啟動後會自動出現）</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {computers.map((c) => (
              <ComputerCard
                key={c.ip}
                pc={c}
                tempDomain={tempDomain}
                theater={theater && theater.agent_id === c.hostname ? theater : undefined}
                theaterOffline={theaterOffline}
                theaterRefreshing={theaterRefreshing}
                onTheaterRefresh={refetchTheater}
                onTheaterFlagChange={setTheaterFlag}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
