"use client";

import { useMemo } from "react";
import { Cpu } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TheaterSection } from "@/components/devices/theater-section";
import { ComputerCharts } from "@/components/devices/lazy-charts";
import {
  PC_COLORS,
  validSocTemperature,
  formatComputerMetric,
  memoryPressureDisplay,
  validMemoryPressure,
  type ComputerPC,
  relativeFromHeartbeat,
  toChartHistory,
} from "@/lib/computer";
import type { TheaterFlagKey, TheaterSummary } from "@/lib/theater";

interface Props {
  pc: ComputerPC;
  /** 溫度圖共用的 Y 軸範圍（整數 °C），讓多張卡之間視覺可比較。
   *  caller 從 cross-PC 的 cpu/gpu 溫度算 min/max + buffer 後傳入。 */
  tempDomain: [number, number];
  /** 劇院 agent 區塊。devices 頁只把 summary 傳給 hostname 對上 agent_id 的卡，
   *  其他卡完全不變。 */
  theater?: TheaterSummary;
  theaterOffline?: boolean;
  theaterRefreshing?: boolean;
  theaterSaving?: boolean;
  theaterStale?: boolean;
  theaterSaveError?: string | null;
  onTheaterRefresh?: () => void;
  onTheaterFlagChange?: (key: TheaterFlagKey, value: boolean) => void;
}

function MetricBlock({
  name,
  model,
  pctText,
  tempText,
  color,
}: {
  name: string;
  model: string;
  pctText: string;
  tempText: string | null;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] bg-elevated/40 px-3 py-2">
      <span className="min-w-0 truncate text-base text-mute">
        <span className="font-semibold uppercase tracking-[0.06em]" style={{ color }}>{name}</span>
        <span>：</span>
        <span className="num">{model || "—"}</span>
      </span>
      <div className="flex flex-shrink-0 items-baseline gap-3">
        <span aria-label={`${name} 使用率 ${pctText}`} className="num text-sm font-semibold text-foreground">
          {pctText}
        </span>
        {tempText !== null && <span aria-label={`${name} 溫度 ${tempText}`} className="num text-sm font-semibold text-foreground">
          {tempText}
        </span>}
      </div>
    </div>
  );
}

export function ComputerCard({
  pc,
  tempDomain,
  theater,
  theaterOffline,
  theaterRefreshing,
  theaterSaving,
  theaterStale,
  theaterSaveError,
  onTheaterRefresh,
  onTheaterFlagChange,
}: Props) {
  const chartHistory = useMemo(() => toChartHistory(pc.history), [pc.history]);
  const hasHistory = chartHistory.length > 0;
  // Mac 的 CPU／GPU 在同一顆晶片上，只有一個 SoC 熱點溫度，不分列在 CPU／GPU 行。
  const isSoc = pc.current?.smc_temperature != null;
  const hasMemoryPressure = pc.current?.memory_pressure != null;
  const pressurePct = validMemoryPressure(pc.online ? pc.current?.memory_pressure?.pct : null);
  const pressure = memoryPressureDisplay(pc.online ? pc.current?.memory_pressure?.level : null);

  return (
    <Card>
      {/* ── 卡頭：IP + 在線指示燈 + heartbeat ── */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-5 w-5 place-items-center text-mute">
            <Cpu className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span className="num truncate text-[22px] font-bold tracking-[-0.01em] text-foreground">{pc.hostname || pc.ip}</span>
        </div>
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${pc.online ? "bg-fresh" : "bg-mute"}`}
            aria-hidden
          />
          <span className="text-[11.5px] text-mute">
            {pc.online ? relativeFromHeartbeat(pc.last_heartbeat_at) : "離線"}
          </span>
        </span>
      </div>

      {pc.hostname && <p className="num text-xs text-mute">{pc.ip}</p>}

      {/* ── 當下值：CPU/GPU 各自一行（用量｜溫度） ── */}
      <div className="grid grid-cols-1 gap-2">
        <MetricBlock
          name="CPU"
          model={pc.cpu_model || ""}
          pctText={formatComputerMetric(pc.current?.cpu_pct, "%")}
          tempText={isSoc ? null : formatComputerMetric(pc.current?.cpu_temp_c, "°C")}
          color={PC_COLORS.cpu}
        />
        <MetricBlock
          name="GPU"
          model={pc.gpu_model || ""}
          pctText={formatComputerMetric(pc.current?.gpu_pct, "%")}
          tempText={isSoc ? null : formatComputerMetric(pc.current?.gpu_temp_c, "°C")}
          color={PC_COLORS.gpu}
        />
      </div>

      {isSoc && (
        <p className="px-1 text-sm text-mute">SoC 溫度：<span className="num font-semibold text-foreground">{formatComputerMetric(validSocTemperature(pc.current?.smc_temperature?.tcmb_c), "°C")}</span></p>
      )}

      {hasMemoryPressure ? (
        <p className="px-1 text-sm text-mute">記憶體壓力：<span className={`font-semibold ${pressure.color}`}>{pressurePct == null ? "數值未知" : `${pressurePct}%`} · {pressure.label}</span></p>
      ) : (
        <p className="px-1 text-sm text-mute">RAM 使用率：<span className="num">{formatComputerMetric(pc.current?.ram_pct, "%")}</span></p>
      )}

      {!hasHistory ? (
        <p className="px-1 text-sm text-mute">等待 agent heartbeat 累積資料...</p>
      ) : (
        <ComputerCharts chartHistory={chartHistory} tempDomain={tempDomain} showMemoryPressure={hasMemoryPressure} />
      )}

      {/* ── 劇院 agent（只有 theater PC 的卡片會收到 summary） ── */}
      {theater && (
        <TheaterSection
          summary={theater}
          offline={!!theaterOffline}
          refreshing={!!theaterRefreshing}
          saving={!!theaterSaving}
          stale={!!theaterStale}
          saveError={theaterSaveError}
          onRefresh={onTheaterRefresh ?? (() => {})}
          onFlagChange={onTheaterFlagChange ?? (() => {})}
        />
      )}
    </Card>
  );
}
