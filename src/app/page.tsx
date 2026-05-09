"use client";

import { useEffect } from "react";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import {
  type WeatherData,
  type DeviceData,
  type DeviceOptions,
  type TodoData,
  type FoodData,
  DEFAULT_OPTIONS,
  daysUntilExpiry,
} from "@/lib/types";
import { type Sensor, computeSensorDomains } from "@/lib/sensor";
import { type AcDevice, getAcSegmentsForLocation } from "@/lib/ac";
import { WeatherCard } from "@/components/home/weather-card";
import { IndoorSensorCard } from "@/components/home/indoor-sensor-card";
import { DeviceQuickControl } from "@/components/home/device-quick-control";
import { TodoListCard } from "@/components/home/todo-list-card";
import { FoodAlertCard } from "@/components/home/food-alert-card";

interface DashboardData {
  weatherToday: WeatherData | null;
  weatherTomorrow: WeatherData | null;
  devices: DeviceData[];
  todos: TodoData[];
  food: FoodData[];
  options: DeviceOptions;
}

/**
 * 首頁 = 五張卡的 orchestrator。
 *
 * 資料流：
 *   /api/dashboard          → 一次拉天氣、裝置 last 狀態、待辦、食品、選項（減少往返）
 *   /api/devices/status     → 補感應器/除濕機即時讀值（home-butler 後端要重新打雲端 API）
 *   useCachedFetch          → localStorage 先回放 → 背景靜默更新（先看到舊值再更新）
 *
 * 每張卡只接收它需要的資料 + refetch callback；互動狀態（展開、樂觀更新等）住在卡內。
 */
export default function HomePage() {
  const { currentUser } = useUser();

  const { data: dashboard, refetch: refetchDashboard } = useCachedFetch<DashboardData | null>(
    "/api/dashboard",
    null,
  );
  const { data: liveStatus, refetch: refetchStatus } = useCachedFetch<
    Record<string, Partial<DeviceData>>
  >("/api/devices/status", {});

  // 今天天氣若拿不到（比如剛跨日預報還沒生）就退回明天的，比顯示「載入中」實用
  const todayHasData =
    dashboard?.weatherToday &&
    !("error" in dashboard.weatherToday) &&
    dashboard.weatherToday.max_t !== null;
  const weather = todayHasData ? dashboard!.weatherToday : dashboard?.weatherTomorrow ?? null;

  // 把 /api/devices/status 的即時讀值合進 /api/dashboard 拿到的 last 狀態
  const allDevices: DeviceData[] = (Array.isArray(dashboard?.devices) ? dashboard.devices : []).map(
    (d) => ({ ...d, ...(liveStatus[d.name] ?? {}) }),
  );
  const todos = Array.isArray(dashboard?.todos) ? dashboard.todos : [];
  const food = Array.isArray(dashboard?.food) ? dashboard.food : [];
  const options = dashboard?.options ?? DEFAULT_OPTIONS;

  const pin = usePinnedDevices();

  // 拉感測器歷史（給釘選的 IndoorSensorCard 畫 24h 折線圖）。
  // 60s auto-refetch 跟 home-butler 內部 polling 節奏對齊。
  const {
    data: sensorsMap,
    refetch: refetchSensors,
  } = useCachedFetch<Record<string, Sensor>>("/api/sensors/status", {});
  useEffect(() => {
    const id = setInterval(() => refetchSensors(), 60_000);
    return () => clearInterval(id);
  }, [refetchSensors]);

  // 拉空調狀態歷史（給 IndoorSensorCard chart 背景畫 AC on 區段色塊）。
  const {
    data: acsMap,
    refetch: refetchAcs,
  } = useCachedFetch<Record<string, AcDevice>>("/api/ac/status", {});
  useEffect(() => {
    const id = setInterval(() => refetchAcs(), 60_000);
    return () => clearInterval(id);
  }, [refetchAcs]);

  // 首頁只顯示釘選的；裝置頁有完整列表
  const pinnedSensor = pin.pinnedSensor
    ? allDevices.find((d) => d.name === pin.pinnedSensor) ?? null
    : null;
  const pinnedSensorHistory = pin.pinnedSensor ? sensorsMap[pin.pinnedSensor] ?? null : null;
  // 首頁只算釘選那一個感測器的自有 domain（只有它自己一張圖）
  const { tempDomain: pinnedTempDomain, humDomain: pinnedHumDomain } = computeSensorDomains(
    pinnedSensorHistory ? [pinnedSensorHistory] : [],
  );
  // 釘選 sensor 所屬的 location 對應的 AC on 區段
  const pinnedAcSegments = pinnedSensorHistory
    ? getAcSegmentsForLocation(acsMap, pinnedSensorHistory.location || "")
    : [];
  const controllableDevices = pin.pinnedDevices
    .map((name) => allDevices.find((d) => d.name === name))
    .filter((d): d is DeviceData => d !== undefined && d.type !== "感應器");

  // 隱私邏輯跟 /todos 頁一致：自己負責 OR 類型公開（沒登入則完全不顯示）。
  // 負責人比對全名或前 2 字（家庭成員可能用暱稱簡寫）。
  // 首頁額外只挑「需要注意」的：5 天內到期 OR 已過期，最多 5 筆。
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const visibleTodos = todos
    .filter((t) => {
      if (t["狀態"] !== "待辦") return false;
      if (!currentUser) return false;
      const isMine =
        t["負責人"] === currentUser.name ||
        t["負責人"] === currentUser.name.substring(0, 2);
      const isPublic = t["類型"] === "公開";
      return isMine || isPublic;
    })
    .filter((t) => {
      if (!t["日期"]) return false;
      const target = new Date(t["日期"]);
      target.setHours(0, 0, 0, 0);
      const diff = target.getTime() - todayStart.getTime();
      return diff <= fiveDaysMs; // 包含負值（過期）跟 0~5 天
    })
    .sort((a, b) => {
      const dateA = `${a["日期"]} ${a["時間"] || "99:99"}`;
      const dateB = `${b["日期"]} ${b["時間"] || "99:99"}`;
      return dateA.localeCompare(dateB);
    })
    .slice(0, 5);

  // 即期食品：5 天內到期或已過期。過期（負數 days）放進來讓使用者及早處理。
  const urgentFood = food.filter((f) => daysUntilExpiry(f["過期日"]) <= 5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <WeatherCard weather={weather} />
      <IndoorSensorCard
        sensor={pinnedSensor}
        sensorHistory={pinnedSensorHistory}
        tempDomain={pinnedTempDomain}
        humDomain={pinnedHumDomain}
        acSegments={pinnedAcSegments}
      />
      <DeviceQuickControl
        devices={controllableDevices}
        options={options}
        onAcCommandSent={refetchDashboard}
        onDehumidifierCommandSent={refetchStatus}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TodoListCard todos={visibleTodos} onCompleted={refetchDashboard} />
        <FoodAlertCard food={urgentFood} />
      </div>
    </div>
  );
}
