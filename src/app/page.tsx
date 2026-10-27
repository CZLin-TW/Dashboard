"use client";

import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import { daysUntilExpiry } from "@/lib/types";
import { HB, type DevicesPage, type HomePage as HomeData, type Weather } from "@/lib/api";
import { devicesOf } from "@/lib/devices";
import { WeatherCard } from "@/components/home/weather-card";
import { IndoorSensorCard } from "@/components/home/indoor-sensor-card";
import { PageHeader } from "@/components/ui/page-header";
import { DeviceQuickControl } from "@/components/home/device-quick-control";
import { TodoListCard } from "@/components/home/todo-list-card";
import { FoodAlertCard } from "@/components/home/food-alert-card";
import { HISTORY_URL } from "@/components/home/history-charts";
import type { History } from "@/lib/api";

// Three independent reads: the life cards (database only), the devices (database and HA's latest
// snapshot, cheap), and the weather (may wait on the weather service). None waits for another.
export default function HomePage() {
  const { currentUser } = useUser();
  const [deviceExpanded, setDeviceExpanded] = useState(false);

  const home = useCachedFetch<HomeData | null>(HB("home"), null);
  const devices = useCachedFetch<DevicesPage | null>(HB("devices"), null);
  // Faster while a device panel is open; otherwise every 30 s for the tiles.
  useAutoRefresh(devices.refetch, deviceExpanded ? 7_000 : 30_000, 0);
  const history = useCachedFetch<History | null>(HISTORY_URL, null, deviceExpanded);

  const today = useCachedFetch<Weather | null>(HB("weather?when=today"), null);
  const todayHasData = !!today.data && today.data.max_t !== null;
  // Fetch tomorrow only when today's completed request cannot supply a forecast.
  const tomorrow = useCachedFetch<Weather | null>(HB("weather?when=tomorrow"), null, !today.loading && !todayHasData);
  const weather = todayHasData ? today.data : tomorrow.data;

  const all = devicesOf(devices.data);
  const pin = usePinnedDevices();
  const pinnedSensor = pin.pinnedSensor ? devices.data?.sensors.find((s) => s.name === pin.pinnedSensor) ?? null : null;
  const controllable = all.filter((d) => d.kind !== "sensor");
  const pinned = pin.pinnedDevices.map((name) => controllable.find((d) => d.name === name)).filter((d) => d !== undefined);

  const todos = home.data?.todos ?? [];
  const urgentFood = (home.data?.food ?? []).filter((f) => f.expires_on && daysUntilExpiry(f.expires_on) <= 5);
  const lifeStatus = !home.hasData ? (home.loading ? "載入中…" : "尚未取得資料，請重新讀取。") : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-5 md:space-y-7">
      <PageHeader title="居家總覽" eyebrow={currentUser ? `你好，${currentUser.name}` : "歡迎回家"}
        actions={<span className="text-xs text-mute">環境・設備・生活</span>} />
      <div className="grid grid-cols-2 items-start gap-3 md:gap-5">
        <WeatherCard weather={weather} loading={today.loading || tomorrow.loading} />
        <IndoorSensorCard sensor={pinnedSensor} page={devices.data} />
      </div>
      <DeviceQuickControl
        devices={pinned}
        page={devices.data}
        onChanged={devices.refetch}
        history={history.data}
        allDevices={controllable}
        onExpandedChange={setDeviceExpanded}
        waiting={devices.isStale}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2 md:gap-5">
        <TodoListCard todos={todos} onCompleted={home.refetch} statusText={lifeStatus} />
        <FoodAlertCard food={urgentFood} statusText={lifeStatus} />
      </div>
    </div>
  );
}
