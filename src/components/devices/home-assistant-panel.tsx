"use client";

import { useEffect, useState } from "react";
import { House, SquarePen, Sun, Users } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { haIsFresh, observationText, type HaSnapshot } from "@/lib/home-assistant";
import { CompactTile } from "@/components/ui/tile-grid";

/** Presence from the devices page's own read (refreshed by the page every few seconds). */
export function HomeAssistantPanel({ data, error, loading, updatedAt, isStale, refetch }: { data: HaSnapshot | null; error: string | null;
  loading: boolean; updatedAt: number | null; isStale: boolean; refetch: () => Promise<void> }) {
  const { currentUser } = useUser();
  const allowed = !!currentUser && currentUser.role !== "remote";
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
        <h2 className="flex items-center gap-2 pt-2 text-sm font-semibold text-mute">
          <House className="h-4 w-4" />空間感測
        </h2>
        <div className="flex items-center gap-3">
          {data?.zone_editor && (
            // 一般連結即可：伺服器簽票後把這個新分頁導向家中主機的編輯工具。
            <a href="/api/zone-editor/enter" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5">
              <SquarePen className="h-3.5 w-3.5" />編輯區域
            </a>
          )}
          <span className={`text-xs ${fresh ? "text-cool" : "text-mute"}`}>{label}</span>
        </div>
      </div>
      {error && <p role="status" className="text-xs text-warm">暫時無法更新，感測狀態顯示為未知。
        <button className="ml-2 underline" onClick={() => void refetch()}>重試</button>
      </p>}
      {!data?.observations.length && <p className="rounded-xl border border-line p-4 text-sm text-mute">
        {loading && !data ? "正在讀取感測器…" : fresh ? "請在 Home Assistant 的 Home Butler 設定選取要同步的感測器。" : "連接家庭中樞後，可在這裡查看各區域是否有人與目前亮度。"}
      </p>}
      {/* 每個區域一個小方塊：有人的亮綠色，沒人的退成外框；亮度有讀數時亮起。 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data?.observations.map(item => {
          const text = observationText(item, fresh);
          const known = fresh && item.available && item.value !== null;
          const occupied = item.kind === "occupancy" && known && item.value === true;
          return <CompactTile key={item.id} icon={item.kind === "occupancy" ? Users : Sun}
            tone={!known ? "unknown" : item.kind === "occupancy" ? (occupied ? "fresh" : "off") : "amber"}
            lit={occupied || (item.kind === "illuminance" && known)} title={item.name}
            value={text} text={item.area ? `· ${item.area}` : undefined} />;
        })}
      </div>
      {!!data?.received_at && <p className="text-xs text-mute">
        最近同步 {new Date(data.received_at * 1000).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
        {!fresh && " · 目前狀態未知"}
      </p>}
    </section>
  );
}
