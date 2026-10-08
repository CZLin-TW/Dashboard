"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PC_COLORS, type ComputerChartPoint } from "@/lib/computer";

// ComputerCard 的兩張 recharts 圖，從卡片本體拆出來單獨成一個非同步 chunk
// （見 lazy-charts.tsx 的說明）。卡片的 IP / 在線燈 / CPU-GPU 數值 / 劇院區塊
// 因此不必等 recharts 就能顯示。

const CHART_HEIGHT = 140;
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RANGE_MS = 24 * 60 * 60 * 1000;

/** X 軸 tick：從最右點時間的最近整點往前每 6 小時，落在 24h 範圍內的全部回傳。
 *  例：rightmost=13:12 → 13:00, 07:00, 01:00, 19:00。 */
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

function ChartTitle({ label, unit }: { label: string; unit: string }) {
  return (
    <h3 className="px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-mute">
      {label} <span className="font-normal normal-case tracking-normal">({unit})</span>
    </h3>
  );
}

interface Props {
  /** caller 已用 toChartHistory 轉好、且確認非空。 */
  chartHistory: ComputerChartPoint[];
  /** 溫度圖共用的 Y 軸範圍（整數 °C），讓多張卡之間視覺可比較。 */
  tempDomain: [number, number];
  showMemoryPressure?: boolean;
}

export function ComputerCharts({ chartHistory, tempDomain, showMemoryPressure = false }: Props) {
  const rightmost = chartHistory[chartHistory.length - 1]?.t ?? 0;
  const ticks = computeTicks(rightmost);
  const pressureGradient = useId().replaceAll(":", "");
  const firstTime = chartHistory[0]?.t ?? 0;
  const span = Math.max(1, rightmost - firstTime);
  // Time-based colors come from actual OS severity, never percentage thresholds.
  const pressureStops = chartHistory.flatMap((point, index) => {
    const previous = chartHistory[index - 1];
    const offset = `${100 * (point.t - firstTime) / span}%`;
    if (!previous) return [{ offset, color: point.pressureColor }];
    return previous.pressureColor === point.pressureColor ? [] : [
      { offset, color: previous.pressureColor }, { offset, color: point.pressureColor },
    ];
  });

  // 溫度圖明確指定 Y ticks（避免 Recharts auto-tick 對奇數差範圍挑出 5 47 53 之類斷層）
  const tempStep = tempDomain[1] - tempDomain[0] <= 30 ? 5 : 10;
  const tempStart = Math.ceil(tempDomain[0] / tempStep) * tempStep;
  const tempYTicks: number[] = [];
  for (let v = tempStart; v <= tempDomain[1] + 1e-9; v += tempStep) tempYTicks.push(v);

  return (
    <>
      {/* ── 圖 1：使用率 % ── */}
      <div className="space-y-1.5">
        <ChartTitle label="使用率" unit="%" />
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={chartHistory} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
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
              interval={0}
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
            <Line type="monotone" dataKey="cpu" name="CPU" stroke={PC_COLORS.cpu} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="gpu" name="GPU" stroke={PC_COLORS.gpu} strokeWidth={2} dot={false} />
            {!showMemoryPressure && <Line type="monotone" dataKey="ram" name="RAM" stroke={PC_COLORS.ram} strokeWidth={2} dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showMemoryPressure && <div className="space-y-1.5">
        <ChartTitle label="記憶體壓力" unit="%" />
        {!chartHistory.some(point => point.pressure != null) ? <p className="px-1 text-sm text-mute">尚無記憶體壓力數值</p> : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart data={chartHistory} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <defs><linearGradient id={pressureGradient} x1="0" y1="0" x2="1" y2="0">
                {pressureStops.map((stop, index) => <stop key={index} offset={stop.offset} stopColor={stop.color} />)}
              </linearGradient></defs>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={formatHHMM} tick={{ fontSize: 10, fill: "var(--color-mute)" }} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} interval={0} tick={{ fontSize: 10, fill: "var(--color-mute)" }} />
              <Tooltip labelFormatter={t => formatHHMM(Number(t))} formatter={v => `${v}%`} contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 10, fontSize: 12 }} />
              <Area type="linear" dataKey="pressure" name="記憶體壓力" stroke={`url(#${pressureGradient})`} fill={`url(#${pressureGradient})`} fillOpacity={0.2} strokeWidth={2} dot={chartHistory.filter(p => p.pressure != null).length === 1} connectNulls={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <p className="px-1 text-xs text-mute">綠：正常 · 黃：警告 · 紅：嚴重 · 灰：狀態未知。每分鐘採樣，最多保留本次後端執行期間的 24 小時。</p>
      </div>}

      {/* ── 圖 2：溫度 °C ── */}
      {!chartHistory.some((point) => point.cpuTemp != null || point.gpuTemp != null || point.tcmb != null || point.tcmz != null) ? (
        <p className="px-1 text-sm text-mute">溫度 unavailable · 無可用感測資料</p>
      ) : <div className="space-y-1.5">
        <ChartTitle label="溫度" unit="°C" />
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={chartHistory} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
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
              domain={tempDomain}
              ticks={tempYTicks}
              interval={0}
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
            {chartHistory.some(p => p.tcmb != null) && <Line type="monotone" dataKey="tcmb" name="TCMb" stroke={PC_COLORS.cpu} strokeWidth={2} dot={false} connectNulls={false} />}
            {chartHistory.some(p => p.tcmz != null) && <Line type="monotone" dataKey="tcmz" name="TCMz" stroke={PC_COLORS.gpu} strokeWidth={2} dot={false} connectNulls={false} />}
            {chartHistory.some(p => p.cpuTemp != null) && <Line type="monotone" dataKey="cpuTemp" name="CPU" stroke={PC_COLORS.cpu} strokeWidth={2} dot={false} />}
            {chartHistory.some(p => p.gpuTemp != null) && <Line type="monotone" dataKey="gpuTemp" name="GPU" stroke={PC_COLORS.gpu} strokeWidth={2} dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>}
    </>
  );
}
