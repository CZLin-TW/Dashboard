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
import type { DehumOnSegment } from "@/lib/dehumidifier";

// 除濕機 on 區段用的斜紋 pattern id。空調維持實心色塊、除濕機用斜紋，兩者重疊時靠
// 「實心 vs 斜紋」的材質差異辨識（與顏色無關）。fresh 綠 = 設計系統的除濕機代表色。
const DEHUM_PATTERN_ID = "dehum-hatch";

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
  dehumSegments?: DehumOnSegment[];
}

function SubChart({ data, ticks, yTicks, dataKey, color, unit, domain, acSegments, dehumSegments }: SubChartProps) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {/* 除濕機 on 區段的斜紋（45°）。低透明度，避免蓋住溫濕度折線。 */}
          <pattern id={DEHUM_PATTERN_ID} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-fresh)" fillOpacity={0.05} />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-fresh)" strokeWidth="1.4" strokeOpacity={0.32} />
          </pattern>
        </defs>
        <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
        {/* AC on 區段背景色塊（畫在 grid 之後、line 之前，視覺在 line 底下）。
            ifOverflow="hidden"：跨越可視時間邊界的 AC 段裁切到 chart 區內，不
            溢出到 Y 軸標籤區。data 短時（新 sensor 累積中）尤其重要。 */}
        {acSegments?.map((seg, i) => (
          <ReferenceArea
            key={`ac-${i}`}
            x1={seg.startT}
            x2={seg.endT}
            fill={modeColor(seg.mode)}
            fillOpacity={0.18}
            strokeOpacity={0}
            ifOverflow="hidden"
          />
        ))}
        {/* 除濕機 on 區段：斜紋 pattern，可與 AC 實心色塊同時顯示且互相可識別。 */}
        {dehumSegments?.map((seg, i) => (
          <ReferenceArea
            key={`dh-${i}`}
            x1={seg.startT}
            x2={seg.endT}
            fill={`url(#${DEHUM_PATTERN_ID})`}
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
          domain={domain}
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
  /** 該感測器所屬 location 的 AC on 區段，畫在 chart 背景（實心色塊）。空 array 不畫。 */
  acSegments?: AcSegment[];
  /** 該感測器所屬 location 的除濕機 on 區段，畫在 chart 背景（斜紋）。空 array 不畫。 */
  dehumSegments?: DehumOnSegment[];
}

/** Stacked 折線圖（溫度 warm / 濕度 cool /（可選）CO2 amber），背景可疊 AC on 區段色塊。
 *  /devices 感測器卡固定顯示；首頁 IndoorSensorCard 包進 expandable 區塊裡。
 *  CO2 panel 僅當 history 有 co2 值（透過 co2Domain 非 null 判斷）時才渲染。 */
export function SensorChart({ history, tempDomain, humDomain, co2Domain, acSegments, dehumSegments }: Props) {
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
  const hasAc = (acSegments?.length ?? 0) > 0;
  const hasDehum = (dehumSegments?.length ?? 0) > 0;

  return (
    <div className="space-y-1">
      {(hasAc || hasDehum) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-mute">
          {hasAc && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-3.5 rounded-[2px]" style={{ background: "var(--color-cool)", opacity: 0.45 }} />
              空調
            </span>
          )}
          {hasDehum && (
            <span className="inline-flex items-center gap-1">
              {/* 自帶 pattern（比 chart 上的更明顯一點），不依賴 chart SVG 的 defs */}
              <svg width="14" height="10" style={{ display: "block" }}>
                <defs>
                  <pattern id={`${DEHUM_PATTERN_ID}-legend`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                    <rect width="5" height="5" fill="var(--color-fresh)" fillOpacity={0.12} />
                    <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-fresh)" strokeWidth="1.4" strokeOpacity={0.7} />
                  </pattern>
                </defs>
                <rect width="14" height="10" rx="2" fill={`url(#${DEHUM_PATTERN_ID}-legend)`} />
              </svg>
              除濕機
            </span>
          )}
        </div>
      )}
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
          dehumSegments={dehumSegments}
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
          dehumSegments={dehumSegments}
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
            dehumSegments={dehumSegments}
          />
        </div>
      )}
    </div>
  );
}
