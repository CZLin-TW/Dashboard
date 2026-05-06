"use client";

import { Cpu } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  type ComputerHistoryPoint,
  type ComputerSnapshot,
  relativeMinutes,
} from "@/lib/computer-mock";

interface Props {
  ip: string;
  history: ComputerHistoryPoint[];
  current: ComputerSnapshot;
}

const CHART_HEIGHT = 140;

// 5 個 tick 對應 24h、18h、12h、6h、0h ago。NUM_POINTS=144 → index 0/36/72/108/143。
const TICK_INDICES = [0, 36, 72, 108, 143];

function formatHHMM(t: number): string {
  const d = new Date(t);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function ChartTitle({ label, unit }: { label: string; unit: string }) {
  return (
    <h3 className="px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-mute">
      {label} <span className="font-normal normal-case tracking-normal">({unit})</span>
    </h3>
  );
}

/** 卡片頂部一格 metric。label 在上、數字在下、橫排排兩格（用量｜溫度）。 */
function MetricBlock({
  name,
  pct,
  tempC,
  pctColor,
  tempColor,
}: {
  name: string;
  pct: number;
  tempC: number;
  pctColor: string;
  tempColor: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[12px] bg-elevated/40 px-3 py-2">
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mute">{name}</span>
      <div className="flex items-baseline gap-3">
        <span className="num text-base font-semibold" style={{ color: pctColor }}>
          {pct}%
        </span>
        <span className="num text-base font-semibold" style={{ color: tempColor }}>
          {tempC}°C
        </span>
      </div>
    </div>
  );
}

export function ComputerCard({ ip, history, current }: Props) {
  const ticks = TICK_INDICES.map((i) => history[i]?.t).filter((v): v is number => v !== undefined);

  // 線條色：用 CSS 變數，跟全站 design token 一致。
  const C_CPU = "var(--color-cool)";
  const C_GPU = "var(--color-fresh)";
  const C_RAM = "var(--color-amber)";
  const C_CPU_TEMP = "var(--color-warm)";
  const C_GPU_TEMP = "var(--color-pin)";

  return (
    <Card>
      {/* ── 卡頭：IP + 在線指示燈 + heartbeat ── */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-4 w-4 place-items-center text-mute">
            <Cpu className="h-4 w-4" strokeWidth={1.8} />
          </span>
          <span className="num truncate text-sm font-semibold text-foreground">{ip}</span>
        </div>
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${current.online ? "bg-fresh" : "bg-mute"}`}
            aria-hidden
          />
          <span className="text-[11.5px] text-mute">
            {current.online ? relativeMinutes(current.lastHeartbeatAt) : "離線"}
          </span>
        </span>
      </div>

      {/* ── 當下值：CPU/GPU 各一行（用量｜溫度） ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MetricBlock
          name="CPU"
          pct={current.cpuPct}
          tempC={current.cpuTempC}
          pctColor={C_CPU}
          tempColor={C_CPU_TEMP}
        />
        <MetricBlock
          name="GPU"
          pct={current.gpuPct}
          tempC={current.gpuTempC}
          pctColor={C_GPU}
          tempColor={C_GPU_TEMP}
        />
      </div>

      {/* ── 圖 1：使用率 % ── */}
      <div className="space-y-1.5">
        <ChartTitle label="使用率" unit="%" />
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={history} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={formatHHMM}
              tick={{ fontSize: 10, fill: "var(--color-mute)" }}
              stroke="var(--color-line)"
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 10, fill: "var(--color-mute)" }}
              stroke="var(--color-line)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={(t) => formatHHMM(Number(t))}
              formatter={(v) => `${v}%`}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="plainline"
              wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
            />
            <Line type="monotone" dataKey="cpu" name="CPU" stroke={C_CPU} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="gpu" name="GPU" stroke={C_GPU} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="ram" name="RAM" stroke={C_RAM} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── 圖 2：溫度 °C ── */}
      <div className="space-y-1.5">
        <ChartTitle label="溫度" unit="°C" />
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={history} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={formatHHMM}
              tick={{ fontSize: 10, fill: "var(--color-mute)" }}
              stroke="var(--color-line)"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "var(--color-mute)" }}
              stroke="var(--color-line)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-line)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={(t) => formatHHMM(Number(t))}
              formatter={(v) => `${v}°C`}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="plainline"
              wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
            />
            <Line
              type="monotone"
              dataKey="cpuTemp"
              name="CPU"
              stroke={C_CPU_TEMP}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="gpuTemp"
              name="GPU"
              stroke={C_GPU_TEMP}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
