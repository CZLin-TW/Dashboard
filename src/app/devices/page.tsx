"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Activity, ArrowUpDown, Cpu, Clapperboard, RefreshCw, Zap } from "lucide-react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import { useUser } from "@/hooks/use-user";
import { PinButton, ClimateReadout, PANEL_BASE } from "@/components/ui/device-controls";
import { DeviceController } from "@/components/ui/device-controller";
import { ComputerCard } from "@/components/devices/computer-card";
import { TheaterSection } from "@/components/devices/theater-section";
import { AutomationCard } from "@/components/devices/automation-card";
import { Card } from "@/components/ui/card";
import { HomeAssistantPanel } from "@/components/devices/home-assistant-panel";
import { SensorChart } from "@/components/devices/lazy-charts";
import { ScheduleSection } from "@/components/devices/schedule-section";
import { RoomOrderEditor } from "@/components/devices/room-order-editor";
import { validSocTemperature } from "@/lib/computer";
import type { TheaterFlagKey, TheaterSummary } from "@/lib/theater";
import { computeSensorDomains } from "@/lib/sensor";
import { HB, ago, send, type DevicesPage as PageData, type History } from "@/lib/api";
import { KIND_ICON, acSegments, automationsOf, byRoom, computerOf, dehumidifierSegmentsAt, devicesOf, presenceOf, roomGroups,
  sensorHistory } from "@/lib/devices";
import { schedulesFor } from "@/lib/schedule";

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

export default function DevicesPage() {
  // One read for the whole page (database and HA's latest snapshot only, so it is cheap): every 7 s
  // while the page is visible. The charts' history is recorded every 5 minutes and read that often.
  const page = useCachedFetch<PageData | null>(HB("devices"), null);
  useAutoRefresh(page.refetch, 7_000, 0);
  const { data: history, refetch: refetchHistory } = useCachedFetch<History | null>(HB("history"), null);
  useAutoRefresh(refetchHistory, 300_000, 0);
  const data = page.data;
  const devices = devicesOf(data);
  const pin = usePinnedDevices();
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sensors = byRoom(data, data?.sensors ?? []);
  const { currentUser } = useUser();
  const canOrderRooms = !!currentUser && currentUser.role !== "remote" && (data?.rooms ?? []).length > 1;
  const [orderingRooms, setOrderingRooms] = useState(false);
  const controllable = devices.filter((d) => d.kind !== "sensor");
  const computers = (data?.computers ?? []).map((c) => computerOf(c, history)).sort((a, b) => a.ip.localeCompare(b.ip));
  const automations = automationsOf(data);
  const presence = presenceOf(data);

  const { data: theater, error: theaterError, loading: theaterRefreshing,
    isStale: theaterStale, refetch: refetchTheater } = useCachedFetch<TheaterSummary | null>(HB("theater"), null);
  useAutoRefresh(refetchTheater);
  const theaterOffline = !!theaterError;
  const [theaterSavingRequest, setTheaterSavingRequest] = useState<{ refetch: typeof refetchTheater } | null>(null);
  const theaterSaving = theaterSavingRequest?.refetch === refetchTheater;
  const [theaterSaveError, setTheaterSaveError] = useState<string | null>(null);
  const theaterWrite = useRef<boolean>(false);
  useEffect(() => () => { theaterWrite.current = false; }, [refetchTheater]);

  const setTheaterFlag = useCallback(async (key: TheaterFlagKey, value: boolean) => {
    if (theaterWrite.current) return;
    theaterWrite.current = true;
    setTheaterSavingRequest({ refetch: refetchTheater });
    setTheaterSaveError(null);
    try {
      const saved = await send<{ flags?: Record<string, boolean> }>("POST", "theater/flags", { [key]: value });
      if (saved?.flags?.[key] !== value) throw new Error("設備未確認設定，請重新整理後再試。");
    } catch {
      setTheaterSaveError("設定結果尚未確認，請確認目前設定後再試。");
    } finally {
      // Replace any poll that started before the write. Never roll back using an old inverse value.
      await refetchTheater();
      theaterWrite.current = false;
      setTheaterSavingRequest(null);
    }
  }, [refetchTheater]);

  // 跨所有感測器算共用 Y 範圍，各張圖視覺對齊。
  const sensorDomains = computeSensorDomains(sensors.map((s) => sensorHistory(history, s.name)));

  // 跨所有電腦算共用溫度 Y 範圍（round 到 5°C，±5 buffer）；沒有溫度資料時 30~90。
  const tempDomain: [number, number] = (() => {
    const temps: number[] = [];
    for (const c of computers) {
      for (const p of [...c.history, c.current]) {
        const soc = validSocTemperature(p?.smc_temperature?.tcmb_c);
        if (soc != null) temps.push(soc);
        if (p?.cpu_temp_c != null) temps.push(p.cpu_temp_c);
        if (p?.gpu_temp_c != null) temps.push(p.gpu_temp_c);
      }
    }
    if (temps.length === 0) return [30, 90];
    return [Math.floor(Math.min(...temps) / 5) * 5 - 5, Math.ceil(Math.max(...temps) / 5) * 5 + 5];
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense>
        <DeviceScrollTarget deviceRefs={deviceRefs} />
      </Suspense>

      {/* ── 裝置控制 ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
            <LayoutGrid className="h-4 w-4" strokeWidth={2} />
            裝置控制
          </h1>
          {canOrderRooms && !orderingRooms && (
            <button type="button" onClick={() => setOrderingRooms(true)}
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5">
              <ArrowUpDown className="h-3.5 w-3.5" />房間順序
            </button>
          )}
        </div>
        {orderingRooms && data && (
          <RoomOrderEditor rooms={data.rooms} onSaved={page.refetch} onClose={() => setOrderingRooms(false)} />
        )}
        <p className="px-1 text-xs text-mute">{data ? `${ago(data.generated_at)}更新${page.error ? " · 資料可能過時，重試中" : page.isStale ? " · 更新中" : ""}` : page.loading ? "載入中…" : "暫時無法讀取裝置"}</p>
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
      {roomGroups(controllable).map(([location, devs]) => (
        <div key={location} className="space-y-3">
          {/* 房間子標題：對比樣式（uppercase + 細底線），跟新的 section h1（小灰字）不打架 */}
          <h2 className="border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wider text-mute">
            {location}
          </h2>
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devs.map((device) => {
              const TypeIcon = KIND_ICON[device.kind];
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

                  {data && <DeviceController device={device} page={data} onChanged={page.refetch} history={history} />}
                  {data && <ScheduleSection device={device} page={data} schedules={schedulesFor(data, device.name)} allDevices={controllable}
                    onSchedulesChange={() => void page.refetch()} autoOff={data.auto_off.find((a) => a.name === device.name)} waiting={page.isStale} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </section>

      <HomeAssistantPanel data={presence} error={page.error} loading={page.loading} updatedAt={page.updatedAt} isStale={page.isStale} refetch={page.refetch} />

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
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((s) => {
              const pinned = pin.isSensorPinned(s.name);
              const SensorIcon = KIND_ICON.sensor;
              const points = sensorHistory(history, s.name);
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
                    co2={s.co2 ?? null}
                    size="md"
                  />
                  {!s.available && <p className="px-1 text-xs text-mute">目前沒有讀數（Home Assistant 未回報）</p>}
                  {points.length > 0 ? (
                    <SensorChart
                      history={points}
                      tempDomain={sensorDomains.tempDomain}
                      humDomain={sensorDomains.humDomain}
                      co2Domain={points.some((p) => p.co2 != null) ? sensorDomains.co2Domain : null}
                      acSegments={acSegments(history, data, s.location)}
                      dehumSegments={dehumidifierSegmentsAt(history, data, s.location)}
                    />
                  ) : (
                    <p className="px-1 text-xs text-mute">等待 24h 資料累積...</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : page.loading ? (
          <p className="px-1 text-sm text-mute">載入中...</p>
        ) : (
          <p className="px-1 text-sm text-mute">未偵測到感測器</p>
        )}
      </section>

      {/* ── 自動化：在背景依規則自己動作的東西（HA 的自動化、劇院連動）都在這裡 ──
          HA 卡一直顯示。劇院卡的規則不變：
          有 summary 且 agent_id 對不上任何一台 PC（走 HA 中繼，或 PC agent 已移除）→ 獨立成卡。
          完全讀不到又沒有快取 → 仍然出現這張卡，只是內容換成錯誤訊息：靜靜不渲染會讓
          「中繼壞掉」跟「這個家沒有劇院」長得一模一樣，那正是 v1.58.1 查了很久的症狀。 */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <Zap className="h-4 w-4" strokeWidth={2} />
          自動化
        </h1>
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <AutomationCard data={automations} failed={!!page.error} refreshing={page.loading} onRefresh={page.refetch} />
          </Card>
          {(theater ? !computers.some((c) => c.hostname === theater.agent_id) : theaterOffline) && (
            <Card>
              {theater ? (
                <TheaterSection
                  summary={theater}
                  offline={theaterOffline}
                  refreshing={theaterRefreshing}
                  saving={theaterSaving}
                  stale={theaterStale}
                  saveError={theaterSaveError}
                  standalone
                  onRefresh={refetchTheater}
                  onFlagChange={setTheaterFlag}
                />
              ) : (
                <div className="space-y-2.5">
                  <h3 className="flex items-center gap-2 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-mute">
                    <Clapperboard className="h-4 w-4" strokeWidth={1.8} />
                    劇院 Agent
                    <span className="rounded-full bg-mute/20 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-mute">
                      離線
                    </span>
                  </h3>
                  <p role="alert" className="px-1 text-xs text-amber-500">
                    劇院狀態讀取失敗，控制暫停。設備本身不受影響。
                  </p>
                  <button
                    type="button"
                    onClick={refetchTheater}
                    disabled={theaterRefreshing}
                    className="flex items-center gap-1.5 rounded-[10px] bg-elevated/40 px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-elevated/60 disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${theaterRefreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
                    重新整理
                  </button>
                </div>
              )}
            </Card>
          )}
        </div>
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
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {computers.map((c) => (
              <ComputerCard
                key={c.ip}
                pc={c}
                tempDomain={tempDomain}
                theater={theater && theater.agent_id === c.hostname ? theater : undefined}
                theaterOffline={theaterOffline}
                theaterRefreshing={theaterRefreshing}
                theaterSaving={theaterSaving}
                theaterStale={theaterStale}
                theaterSaveError={theaterSaveError}
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
