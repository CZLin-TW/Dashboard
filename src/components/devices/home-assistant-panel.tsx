"use client";

import { useEffect, useState } from "react";
import { House, Sun, Users } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { haIsFresh, observationText, type HaSnapshot } from "@/lib/home-assistant";
import { PANEL_BASE } from "@/components/ui/device-controls";

export function HomeAssistantPanel() {
  const { currentUser } = useUser();
  const allowed = !!currentUser && currentUser.role !== "kid";
  const { data, error, loading, updatedAt, isStale, refetch } =
    useCachedFetch<HaSnapshot | null>("/api/home-assistant/observations", null, allowed);
  useAutoRefresh(refetch, 5_000, 0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
  if (!allowed) return null;
  const fresh = haIsFresh(data, updatedAt, now, !!error || isStale);
  const label = error ? "連線異常" : !data ? "讀取中" : !data.configured ? "尚未連接" : fresh ? "已連線" : "等待同步";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <House className="h-4 w-4" />空間感測
        </h2>
        <span className={`text-xs ${fresh ? "text-cool" : "text-mute"}`}>{label}</span>
      </div>
      {error && <p role="status" className="text-xs text-warm">暫時無法更新，感測狀態顯示為未知。
        <button className="ml-2 underline" onClick={() => void refetch()}>重試</button>
      </p>}
      {!data?.observations.length && <p className="rounded-xl border border-line p-4 text-sm text-mute">
        {loading && !data ? "正在讀取感測器…" : fresh ? "請在 Home Assistant 的 Home Butler 設定選取要同步的感測器。" : "連接家庭中樞後，可在這裡查看各區域是否有人與目前亮度。"}
      </p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.observations.map(item => {
          const Icon = item.kind === "occupancy" ? Users : Sun;
          return <div key={item.id} className={PANEL_BASE}>
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-mute" />
              <h3 className="min-w-0 break-words text-base font-semibold">{item.name}</h3>
            </div>
            <p className="text-xs text-mute">{item.area || "未指定空間"} · {item.kind === "occupancy" ? "存在感測" : "亮度"}</p>
            <p className={`text-2xl font-semibold tabular-nums ${fresh && item.available ? "text-foreground" : "text-mute"}`}>
              {observationText(item, fresh)}
            </p>
          </div>;
        })}
      </div>
      {!!data?.received_at && <p className="text-xs text-mute">
        最近同步 {new Date(data.received_at * 1000).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
        {!fresh && " · 目前狀態未知"}
      </p>}
    </section>
  );
}
