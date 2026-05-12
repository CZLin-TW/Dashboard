"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type SensorChartPoint, toSensorChartHistory } from "@/lib/sensor";
import type { SensorHistoryRaw } from "@/lib/sensor";
import type { AcSegment } from "@/lib/ac";
import { modeColor } from "@/lib/ac";

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
  yTicks: number[];
  dataKey: "temp" | "humidity" | "co2";
  color: string;
  unit: string;
  domain: [number, number];
  acSegments?: AcSegment[];
}

function SubChart({ data, ticks, yTicks, dataKey, color, unit, domain, acSegments }: SubChartProps) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        {/* AC on 區段背景色塊（畫在 grid 之後、line 之前，視覺在 line 底下） */}
        {acSegments?.map((seg, i) => (
          <ReferenceArea
            key={i}
            x1={seg.startT}
            x2={seg.endT}
            fill={modeColor(seg.mode)}
            fillOpacity={0.18}
            strokeOpacity={0}
            ifOverflow="visible"
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
          domain={domain}
          ticks={yTicks}
          interval={0}
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
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 從 domain 跟 step 算明確 ticks（避免 Recharts auto-tick 對奇數差範圍挑出
 *  非整數倍 tick 造成數值斷層、看起來不規則的問題）。 */
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
  history: SensorHistoryRaw[];
  tempDomain: [number, number];
  humDomain: [number, number];
  /** Meter Pro CO2 才有；其他感測器傳 null，第三個 panel 不渲染。 */
  co2Domain?: [number, number] | null;
  /** 該感測器所屬 location 的 AC on 區段，畫在 chart 背景。空 array 不畫。 */
  acSegments?: AcSegment[];
}

/** Stacked 折線圖（溫度 warm / 濕度 cool /（可選）CO2 amber），背景可疊 AC on 區段色塊。
 *  /devices 感測器卡固定顯示；首頁 IndoorSensorCard 包進 expandable 區塊裡。
 *  CO2 panel 僅當 history 有 co2 值（透過 co2Domain 非 null 判斷）時才渲染。 */
export function SensorChart({ history, tempDomain, humDomain, co2Domain, acSegments }: Props) {
  const data = toSensorChartHistory(history);
  if (data.length === 0) {
    return <p className="px-1 text-xs text-mute">等待資料累積...</p>;
  }

  const rightmost = data[data.length - 1].t;
  const ticks = computeTicks(rightmost);
  const tempStep = (tempDomain[1] - tempDomain[0]) <= 8 ? 1 : 2;
  const tempYTicks = makeYTicks(tempDomain, tempStep);
  const humYTicks = makeYTicks(humDomain, 5);
  const co2YTicks = co2Domain ? makeYTicks(co2Domain, 200) : [];

  return (
    <div className="space-y-1">
      <div>
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
          溫度 <span className="font-normal normal-case tracking-normal">(°C)</span>
        </h3>
        <SubChart
          data={data}
          ticks={ticks}
          yTicks={tempYTicks}
          dataKey="temp"
          color="var(--color-warm)"
          unit="°C"
          domain={tempDomain}
          acSegments={acSegments}
        />
      </div>
      <div>
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
          濕度 <span className="font-normal normal-case tracking-normal">(%)</span>
        </h3>
        <SubChart
          data={data}
          ticks={ticks}
          yTicks={humYTicks}
          dataKey="humidity"
          color="var(--color-cool)"
          unit="%"
          domain={humDomain}
          acSegments={acSegments}
        />
      </div>
      {co2Domain && (
        <div>
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
            CO<sub>2</sub> <span className="font-normal normal-case tracking-normal">(ppm)</span>
          </h3>
          <SubChart
            data={data}
            ticks={ticks}
            yTicks={co2YTicks}
            dataKey="co2"
            color="var(--color-amber)"
            unit=" ppm"
            domain={co2Domain}
            acSegments={acSegments}
          />
        </div>
      )}
    </div>
  );
}
