"use client";

import { useState } from "react";
import { House, RefreshCw } from "lucide-react";
import { automationTimeLabel, automationView, type HaAutomationLog } from "@/lib/home-assistant";

// 「自動化」區塊裡的 Home Assistant 卡：哪些規則存在、最近哪一條動作過。純顯示。
// 之後若要加「暫停／恢復某條規則」的開關，放在規則清單每一列的右側（比照劇院卡的開關）。

const RECENT = 8;
const NOTICES = {
  unconfigured: "後端尚未設定 Home Assistant 連線。",
  not_shared: "還沒開啟分享：到 HA 的 Home Butler 整合設定，勾選「分享自動化清單與最近的執行記錄」。",
  offline: "目前連不上 Home Assistant，以下是斷線前收到的記錄。",
} as const;

interface Props {
  data: HaAutomationLog | null;
  /** 讀取失敗（可能仍有上次的資料可顯示）。 */
  failed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

export function AutomationCard({ data, failed, refreshing, onRefresh }: Props) {
  const [showAll, setShowAll] = useState(false);
  const { notice, runs, rules } = automationView(data);
  const online = !!data?.online && !failed;
  const shown = showAll ? runs : runs.slice(0, RECENT);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-mute">
          <House className="h-4 w-4" strokeWidth={1.8} />
          Home Assistant
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${online ? "bg-fresh/15 text-fresh" : "bg-mute/20 text-mute"}`}>
            {online ? "在線" : "離線"}
          </span>
        </h3>
        <button type="button" onClick={onRefresh} disabled={refreshing} title="重新整理" aria-label="重新整理"
          className="grid h-7 w-7 place-items-center rounded-[8px] text-mute transition-colors hover:bg-elevated/60 hover:text-foreground disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
        </button>
      </div>

      {!data && (failed
        ? <p role="alert" className="px-1 text-xs text-amber-500">自動化記錄讀取失敗。家裡的自動化本身不受影響。</p>
        : <p role="status" className="px-1 text-xs text-mute">正在讀取…</p>)}
      {data && failed && <p className="px-1 text-xs text-amber-500">顯示上次資料，請重新整理。</p>}
      {notice && <p role="status" className="px-1 text-xs leading-relaxed text-amber-500">{NOTICES[notice]}</p>}

      {data && notice !== "unconfigured" && notice !== "not_shared" && (
        <>
          <div className="space-y-1">
            <p className="px-1 text-[11px] font-medium text-mute">最近執行</p>
            {shown.length === 0 ? (
              <p className="px-1 text-xs leading-relaxed text-mute">Home Assistant 上次啟動後還沒有自動化執行過。</p>
            ) : (
              <ul className="space-y-1">
                {shown.map((run, index) => (
                  <li key={`${run.entity_id}-${run.at}-${index}`} title={run.source || undefined}
                    className="flex min-w-0 items-baseline gap-2 rounded-[10px] bg-elevated/40 px-3 py-1.5">
                    <span className="num shrink-0 text-xs text-mute">{automationTimeLabel(run.at)}</span>
                    <span className="min-w-0 truncate text-[13px] text-foreground">{run.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {runs.length > RECENT && (
              <button type="button" onClick={() => setShowAll((value) => !value)} className="px-1 text-xs text-cool hover:underline">
                {showAll ? "只看最近幾筆" : `顯示全部 ${runs.length} 筆`}
              </button>
            )}
          </div>

          {rules.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none px-1 text-[11px] font-medium text-mute hover:text-foreground">
                全部規則（{rules.length}）<span className="ml-1 group-open:hidden">▸</span><span className="ml-1 hidden group-open:inline">▾</span>
              </summary>
              <ul className="mt-1 space-y-1">
                {rules.map((rule) => (
                  <li key={rule.entity_id} className="flex min-w-0 items-baseline justify-between gap-2 px-3 py-1">
                    <span className={`min-w-0 truncate text-[13px] ${rule.enabled === false ? "text-mute line-through" : "text-foreground"}`}>{rule.name}</span>
                    <span className="num shrink-0 text-xs text-mute">
                      {rule.enabled === false ? "已停用" : rule.last_triggered ? automationTimeLabel(rule.last_triggered) : "尚未執行"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
