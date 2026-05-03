"use client";

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

  // 首頁只顯示釘選的；裝置頁有完整列表
  const pinnedSensor = pin.pinnedSensor
    ? allDevices.find((d) => d.name === pin.pinnedSensor) ?? null
    : null;
  const controllableDevices = pin.pinnedDevices
    .map((name) => allDevices.find((d) => d.name === name))
    .filter((d): d is DeviceData => d !== undefined && d.type !== "感應器");

  // 「我的」待辦：負責人 = 登入者全名，或前 2 字（家庭成員可能用暱稱簡寫）
  const myTodos = todos
    .filter(
      (t) =>
        t["狀態"] === "待辦" &&
        (!currentUser ||
          t["負責人"] === currentUser.name ||
          t["負責人"] === currentUser.name.substring(0, 2)),
    )
    .sort((a, b) => {
      const dateA = `${a["日期"]} ${a["時間"] || "99:99"}`;
      const dateB = `${b["日期"]} ${b["時間"] || "99:99"}`;
      return dateA.localeCompare(dateB);
    })
    .slice(0, 5);

  // 即期食品：今天到 3 天內到期；過期（負數 days）刻意不在首頁紅色提醒，避免使用者厭倦
  const urgentFood = food.filter((f) => {
    const days = daysUntilExpiry(f["過期日"]);
    return days >= 0 && days <= 3;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <WeatherCard weather={weather} />
      <IndoorSensorCard sensor={pinnedSensor} />
      <DeviceQuickControl
        devices={controllableDevices}
        options={options}
        onAcCommandSent={refetchDashboard}
        onDehumidifierCommandSent={refetchStatus}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TodoListCard todos={myTodos} onCompleted={refetchDashboard} />
        <FoodAlertCard food={urgentFood} />
      </div>
    </div>
  );
}
