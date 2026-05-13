"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensorHistoryRaw } from "@/lib/sensor";
import { toSensorChartHistory } from "@/lib/sensor";
import type { DehumOnSegment } from "@/lib/dehumidifier";

// 自動模式 chart：卡片內顯示綁定 sensor 的 24h 濕度線 + 除濕機運轉中綠色區段 +
// hysteresis 上下界虛線（target / target+5）。只在 auto_mode=ON 時 render。
// X 軸刻度、tick formatter 跟 sensor-chart 的 SubChart 保持一致。

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RANGE_MS = 24 * 60 * 60 * 1000;
const HYSTERESIS_OFFSET = 5;

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

/** 從 domain 跟 step 算明確 ticks（避免 Recharts auto-tick 對奇數差範圍挑出
 *  非整數倍 tick 造成數值斷層、看起來不規則的問題）。同 sensor-chart 的邏輯。 */
function makeYTicks(domain: [number, number], step: number): number[] {
  const [lo, hi] = domain;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) {
    ticks.push(v);
  }
  return ticks;
}

interface Props {
  sensorHistory: SensorHistoryRaw[];
  onSegments: DehumOnSegment[];
  threshold: number;
}

export function AutoModeChart({ sensorHistory, onSegments, threshold }: Props) {
  const data = toSensorChartHistory(sensorHistory);
  if (data.length === 0) {
    return (
      <p className="px-1 text-xs text-mute">等待自動模式 polling 累積資料...</p>
    );
  }

  const rightmost = data[data.length - 1].t;
  const ticks = computeTicks(rightmost);
  const hOn = threshold + HYSTERESIS_OFFSET;

  // Y 軸 domain：要求兩條虛線都看得到 + sensor 線上下也留 buffer
  const allHums = data
    .map((p) => p.humidity)
    .filter((h): h is number => h != null);
  const minHum = Math.min(...allHums, threshold - HYSTERESIS_OFFSET);
  const maxHum = Math.max(...allHums, hOn + HYSTERESIS_OFFSET);
  const yDomain: [number, number] = [
    Math.max(0, Math.floor(minHum / 5) * 5 - 5),
    Math.min(100, Math.ceil(maxHum / 5) * 5 + 5),
  ];
  const yTicks = makeYTicks(yDomain, 5);

  return (
    <div>
      <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
        綁定感測器 24h{" "}
        <span className="font-normal normal-case tracking-normal">
          (% · 背景綠 = 除濕機運轉)
        </span>
      </h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            stroke="var(--color-line)"
            strokeDasharray="3 3"
            vertical={false}
          />
          {/* 除濕機 on 區段背景 (fresh 綠) */}
          {onSegments.map((seg, i) => (
            <ReferenceArea
              key={i}
              x1={seg.startT}
              x2={seg.endT}
              fill="var(--color-fresh)"
              fillOpacity={0.18}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
          ))}
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
            domain={yDomain}
            ticks={yTicks}
            interval={0}
            tick={{ fontSize: 10, fill: "var(--color-mute)" }}
            stroke="var(--color-line)"
            width={48}
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
          {/* Hysteresis 上下界虛線。不顯示數值 label——Y 軸 tick 已顯示，避免重複。 */}
          <ReferenceLine
            y={threshold}
            stroke="var(--color-mute)"
            strokeDasharray="4 4"
          />
          <ReferenceLine
            y={hOn}
            stroke="var(--color-mute)"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="humidity"
            stroke="var(--color-cool)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
