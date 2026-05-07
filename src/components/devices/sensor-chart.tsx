"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type SensorChartPoint, toSensorChartHistory } from "@/lib/sensor";
import type { SensorHistoryRaw } from "@/lib/sensor";

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RANGE_MS = 24 * 60 * 60 * 1000;

function computeTicks(rightmost: number): number[] {
  const RANGE_START = rightmost - RANGE_MS;
  const startHour = new Date(rightmost);
  startHour.setMinutes(0, 0, 0);
  const ticks: number[] = [];
  for (let t = startHour.getTime(); t >= RANGE_START; t -= TICK_INTERVAL_MS) {
    ticks.push(t);
  }
  return ticks.reverse();
}

function formatHHMM(t: number): string {
  const d = new Date(t);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

interface SubChartProps {
  data: SensorChartPoint[];
  ticks: number[];
  dataKey: "temp" | "humidity";
  color: string;
  unit: string;
  domain: [number, number];
}

function SubChart({ data, ticks, dataKey, color, unit, domain }: SubChartProps) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
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
          domain={domain}
          tick={{ fontSize: 10, fill: "var(--color-mute)" }}
          stroke="var(--color-line)"
          width={36}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-line)",
            borderRadius: 10,
            fontSize: 12,
          }}
          labelFormatter={(t) => formatHHMM(Number(t))}
          formatter={(v) => `${v}${unit}`}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface Props {
  history: SensorHistoryRaw[];
  tempDomain: [number, number];
  humDomain: [number, number];
}

/** 兩張 stacked 折線圖（溫度上 warm 色 / 濕度下 cool 色）。
 *  /devices 感測器卡固定顯示；首頁 IndoorSensorCard 包進 expandable 區塊裡。 */
export function SensorChart({ history, tempDomain, humDomain }: Props) {
  const data = toSensorChartHistory(history);
  if (data.length === 0) {
    return <p className="px-1 text-xs text-mute">等待資料累積...</p>;
  }

  const rightmost = data[data.length - 1].t;
  const ticks = computeTicks(rightmost);

  return (
    <div className="space-y-1">
      <div>
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
          溫度 <span className="font-normal normal-case tracking-normal">(°C)</span>
        </h3>
        <SubChart
          data={data}
          ticks={ticks}
          dataKey="temp"
          color="var(--color-warm)"
          unit="°C"
          domain={tempDomain}
        />
      </div>
      <div>
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
          濕度 <span className="font-normal normal-case tracking-normal">(%)</span>
        </h3>
        <SubChart
          data={data}
          ticks={ticks}
          dataKey="humidity"
          color="var(--color-cool)"
          unit="%"
          domain={humDomain}
        />
      </div>
    </div>
  );
}
