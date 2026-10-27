"use client";

import { useCallback, useEffect, useRef, useState, Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Activity, AlertTriangle, ArrowUpDown, Cpu, Clapperboard, Droplet, House, Pin, RefreshCw, Thermometer, User, Zap,
  type LucideIcon } from "lucide-react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import { useUser } from "@/hooks/use-user";
import { PinButton, PANEL_BASE } from "@/components/ui/device-controls";
import { CompactTile, ExpandRow, PanelHeader, TileBadge, TileGrid, type TileTone } from "@/components/ui/tile-grid";
import { DeviceTiles } from "@/components/devices/device-tiles";
import { ComputerCard } from "@/components/devices/computer-card";
import { TheaterSection } from "@/components/devices/theater-section";
import { AutomationCard } from "@/components/devices/automation-card";
import { Card } from "@/components/ui/card";
import { HomeAssistantPanel } from "@/components/devices/home-assistant-panel";
import { SensorChart } from "@/components/devices/lazy-charts";
import { RoomOrderEditor } from "@/components/devices/room-order-editor";
import { memoryPressureDisplay, relativeFromHeartbeat, validSocTemperature, type ComputerPC } from "@/lib/computer";
import { THEATER_TV_STATE_LABELS, type TheaterFlagKey, type TheaterSummary } from "@/lib/theater";
import { computeSensorDomains } from "@/lib/sensor";
import { HB, ago, send, type DevicesPage as PageData, type History } from "@/lib/api";
import { KIND_ICON, acSegments, automationsOf, byRoom, computerOf, dehumidifierSegmentsAt, devicesOf, presenceOf, roomGroups,
  sensorHistory } from "@/lib/devices";
import { automationTimeLabel, automationView, haIsFresh, type HaAutomationLog } from "@/lib/home-assistant";

/** `/devices?target=<設備名稱>`：打開那台的控制並捲過去。 */
function DeviceScrollTarget({ onTarget }: { onTarget: (name: string) => void }) {
  const searchParams = useSearchParams();
  const targetDevice = searchParams.get("target");

  useEffect(() => {
    if (!targetDevice) return;
    onTarget(targetDevice);
    const t = setTimeout(() => {
      const el = [...document.querySelectorAll<HTMLElement>("[data-tile]")].find((e) => e.dataset.tile === targetDevice && e.offsetParent);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
    return () => clearTimeout(t);
  }, [targetDevice, onTarget]);

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
  const sensors = byRoom(data, data?.sensors ?? []);
  const { currentUser } = useUser();
  const canOrderRooms = !!currentUser && currentUser.role !== "remote" && (data?.rooms ?? []).length > 1;
  const [orderingRooms, setOrderingRooms] = useState(false);
  const controllable = devices.filter((d) => d.kind !== "sensor");
  const computers = (data?.computers ?? []).map((c) => computerOf(c, history)).sort((a, b) => a.ip.localeCompare(b.ip));
  const automations = automationsOf(data);
  const presence = presenceOf(data);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [expandedSensor, setExpandedSensor] = useState<string | null>(null);
  const automationSummary = automationRow(automations, !!page.error);
  // 房間標題旁的摘要：那個房間第一個有讀數的感測器，加上空間感測（只有成員拿得到）的有人／無人。
  const presenceFresh = haIsFresh(presence, page.updatedAt, page.updatedAt ?? 0, !!page.error || page.isStale);
  function roomSummary(room: string): { key: string; text: string; Icon: LucideIcon; tone: string }[] {
    const parts: { key: string; text: string; Icon: LucideIcon; tone: string }[] = [];
    const sensor = sensors.find((s) => s.location === room && s.available);
    if (sensor?.temperature != null) parts.push({ key: "t", text: `${sensor.temperature}°`, Icon: Thermometer, tone: "var(--color-chart-temperature)" });
    if (sensor?.humidity != null) parts.push({ key: "h", text: `${sensor.humidity}%`, Icon: Droplet, tone: "var(--color-chart-humidity)" });
    const occupancy = presenceFresh ? (presence?.observations ?? []).filter((o) => o.kind === "occupancy" && o.area === room && o.available) : [];
    if (occupancy.some((o) => o.value === true)) parts.push({ key: "p", text: "有人", Icon: User, tone: "var(--color-fresh)" });
    else if (occupancy.length > 0 && occupancy.every((o) => o.value === false)) parts.push({ key: "p", text: "無人", Icon: User, tone: "var(--color-faint)" });
    return parts;
  }

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
        <DeviceScrollTarget onTarget={setExpandedDevice} />
      </Suspense>

      {/* ── 裝置控制：每個房間一個標題（附那個房間的溫濕度與有沒有人），下面是設備方塊，點了才展開控制 ── */}
      <section className="space-y-5">
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
        {/* 正常時不顯示「幾秒前更新」，只在讀不到或資料過時才說。 */}
        {(!data || page.error) && (
          <p className="px-1 text-xs text-mute">{data ? `${ago(data.generated_at)}更新 · 資料可能過時，重試中` : page.loading ? "載入中…" : "暫時無法讀取裝置"}</p>
        )}

        {roomGroups(controllable).map(([location, devs]) => {
          const summary = roomSummary(location);
          return (
            <div key={location} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
                <h2 className="text-[19px] font-semibold tracking-tight text-foreground">{location}</h2>
                {summary.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {summary.map(({ key, text, Icon, tone }) => (
                      <span key={key} className="num flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-soft shadow-[0_1px_4px_-2px_rgba(31,36,43,0.2)]">
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} style={{ color: tone }} />{text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <DeviceTiles devices={devs} page={data} onChanged={page.refetch} history={history} allDevices={controllable}
                waiting={page.isStale} expanded={expandedDevice} onSelect={setExpandedDevice}
                panelActions={(device) => {
                  const pinned = pin.isDevicePinned(device.name);
                  const canPin = pinned || pin.canPinMore;
                  return (
                    <>
                      {!canPin && <span className="text-[11px] text-mute">首頁已釘滿</span>}
                      <PinButton pinned={pinned} disabled={!canPin} onClick={() => pin.togglePinDevice(device.name)}
                        title={pinned ? "已釘選至首頁" : canPin ? "釘選至首頁" : `已達上限 ${pin.MAX_PINNED_DEVICES} 個`} />
                    </>
                  );
                }} />
            </div>
          );
        })}
      </section>

      <HomeAssistantPanel data={presence} error={page.error} loading={page.loading} updatedAt={page.updatedAt} isStale={page.isStale} refetch={page.refetch} />

      {/* ── 環境感測：每個感測器一個小方塊（當下讀數），點了才展開 24 小時圖與釘選 ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <Activity className="h-4 w-4" strokeWidth={2} />
          環境感測
        </h1>
        {sensors.length > 0 ? (
          <TileGrid items={sensors} keyOf={(s) => s.name} expanded={expandedSensor} cols={[2, 4]}
            renderTile={(s, active) => {
              const extra = s.humidity != null ? `${s.humidity}%` : "";
              return (
                <CompactTile icon={KIND_ICON.sensor} tone={s.available ? "temp" : "unknown"} lit={s.available} title={s.name || s.location}
                  value={s.available && s.temperature != null ? `${s.temperature}°` : null} text={s.available ? extra : "沒有讀數"}
                  note={s.available && s.co2 != null ? <span className="num text-mute">CO₂ {s.co2} ppm</span> : null}
                  onClick={() => setExpandedSensor(active ? null : s.name)} active={active} dataKey={`sensor:${s.name}`}
                  badge={pin.isSensorPinned(s.name) ? <TileBadge icon={Pin} alert={false} /> : null} />
              );
            }}
            renderPanel={(s) => {
              const points = sensorHistory(history, s.name);
              const pinned = pin.isSensorPinned(s.name);
              return (
                <div className={PANEL_BASE}>
                  <PanelHeader icon={KIND_ICON.sensor} tone={s.available ? "temp" : "unknown"} title={s.name || s.location}
                    value={s.available && s.temperature != null ? `${s.temperature}°` : null}
                    text={s.available ? [s.humidity != null ? `${s.humidity}%` : null, s.co2 != null ? `CO₂ ${s.co2} ppm` : null].filter(Boolean).join(" · ") : "沒有讀數"}
                    actions={<PinButton pinned={pinned} onClick={() => pin.setPinnedSensor(pinned ? null : s.name)}
                      title={pinned ? "已釘選至首頁" : "釘選至首頁（只能一個）"} />}
                    onClose={() => setExpandedSensor(null)} />
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
            }} />
        ) : page.loading ? (
          <p className="px-1 text-sm text-mute">載入中...</p>
        ) : (
          <p className="px-1 text-sm text-mute">未偵測到感測器</p>
        )}
      </section>

      {/* ── 自動化：在背景依規則自己動作的東西（HA 的自動化、劇院連動）都在這裡，平常各收成一行摘要 ──
          HA 那一行一直顯示。劇院的規則不變：
          有 summary 且 agent_id 對不上任何一台 PC（走 HA 中繼，或 PC agent 已移除）→ 獨立一行。
          完全讀不到又沒有快取 → 仍然出現這一行，只是內容換成錯誤訊息：靜靜不渲染會讓
          「中繼壞掉」跟「這個家沒有劇院」長得一模一樣，那正是 v1.58.1 查了很久的症狀。
          收起來時有狀況要看得出來：摘要變紅、圖示變紅。 */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <Zap className="h-4 w-4" strokeWidth={2} />
          自動化
        </h1>
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          <ExpandRow icon={House} {...automationSummary}>
            <Card>
              <AutomationCard data={automations} failed={!!page.error} refreshing={page.loading} onRefresh={page.refetch} />
            </Card>
          </ExpandRow>
          {(theater ? !computers.some((c) => c.hostname === theater.agent_id) : theaterOffline) && (
            <ExpandRow icon={Clapperboard} {...theaterSummary(theater, theaterOffline || theaterStale)}>
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
            </ExpandRow>
          )}
        </div>
      </section>

      {/* ── 電腦：每台一行摘要，點了展開原本的卡（圖表、劇院） ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <Cpu className="h-4 w-4" strokeWidth={2} />
          電腦
        </h1>
        {computers.length === 0 ? (
          <p className="px-1 text-sm text-mute">目前沒有電腦在線（agent 啟動後會自動出現）</p>
        ) : (
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
            {computers.map((c) => (
              <ExpandRow key={c.ip} icon={Cpu} {...computerSummary(c)}>
                <ComputerCard
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
              </ExpandRow>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type RowSummary = { tone: TileTone; lit: boolean; title: string; text: ReactNode; note?: ReactNode; badge?: ReactNode };
const problem = (text: string) => <span className="text-warm">{text}</span>;

function automationRow(data: HaAutomationLog | null, failed: boolean): RowSummary {
  const { notice, runs } = automationView(data);
  const base = { title: "Home Assistant 自動化" };
  if (!data) return { ...base, tone: failed ? "warm" : "unknown", lit: failed, text: failed ? problem("讀取失敗") : "讀取中…" };
  if (notice === "unconfigured") return { ...base, tone: "off", lit: false, text: "後端尚未設定" };
  if (notice === "not_shared") return { ...base, tone: "off", lit: false, text: "還沒開啟分享" };
  const last = runs[0] ? `最近：${automationTimeLabel(runs[0].at)} ${runs[0].name}` : "還沒有執行記錄";
  if (notice === "offline" || failed) return { ...base, tone: "warm", lit: true, text: problem(notice === "offline" ? "連不上 Home Assistant" : "顯示上次資料"), note: <span className="text-mute">{last}</span>,
    badge: <TileBadge icon={AlertTriangle} alert /> };
  return { ...base, tone: "fresh", lit: true, text: last };
}

function theaterSummary(summary: TheaterSummary | null, unreachable: boolean): RowSummary {
  const base = { title: "劇院連動" };
  if (!summary) return { ...base, tone: "warm", lit: true, text: problem("讀取失敗，控制暫停"), badge: <TileBadge icon={AlertTriangle} alert /> };
  const on = Object.values(summary.flags ?? {}).filter(Boolean).length;
  const total = Object.keys(summary.flags ?? {}).length;
  const tv = THEATER_TV_STATE_LABELS[summary.monitor?.last_tv_state ?? ""];
  const text = [`${on}/${total} 項開啟`, tv ? `電視${tv}` : null].filter(Boolean).join(" · ");
  const health = summary.health;
  const trouble = unreachable ? "離線，顯示上次資料"
    : health?.flags_error ? "設定檔讀取異常"
    : Object.values(summary.devices ?? {}).some((d) => d?.stale || d?.error) ? "部分設備狀態未更新"
    : health?.appletv?.stale ? "Apple TV 監控沒有心跳"
    : health?.update?.status && !["updated", "up_to_date", "pending"].includes(health.update.status) ? "自動更新需要留意"
    : null;
  if (trouble) return { ...base, tone: "warm", lit: true, text: problem(trouble), note: <span className="text-mute">{text}</span>, badge: <TileBadge icon={AlertTriangle} alert /> };
  return { ...base, tone: on > 0 ? "fresh" : "off", lit: on > 0, text };
}

function computerSummary(pc: ComputerPC): RowSummary {
  const title = pc.hostname || pc.ip;
  if (!pc.online) return { title, tone: "warm", lit: true, text: problem(`離線 · ${relativeFromHeartbeat(pc.last_heartbeat_at)}`), badge: <TileBadge icon={AlertTriangle} alert /> };
  const soc = validSocTemperature(pc.current?.smc_temperature?.tcmb_c);
  const temp = soc ?? pc.current?.cpu_temp_c ?? null;
  const parts = [pc.current?.cpu_pct != null ? `CPU ${Math.round(pc.current.cpu_pct)}%` : null, temp != null ? `${Math.round(temp)}°C` : null].filter(Boolean).join(" · ");
  const level = pc.current?.memory_pressure?.level;
  if (level === "warning" || level === "critical") {
    return { title, tone: "amber", lit: true, text: <span className="text-amber">記憶體壓力{memoryPressureDisplay(level).label}</span>, note: <span className="text-mute">{parts}</span> };
  }
  return { title, tone: "fresh", lit: true, text: parts || "在線" };
}
