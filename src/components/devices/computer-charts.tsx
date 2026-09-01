"use client";

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
}

export function ComputerCharts({ chartHistory, tempDomain }: Props) {
  const rightmost = chartHistory[chartHistory.length - 1]?.t ?? 0;
  const ticks = computeTicks(rightmost);

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
            <Line type="monotone" dataKey="ram" name="RAM" stroke={PC_COLORS.ram} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── 圖 2：溫度 °C ── */}
      <div className="space-y-1.5">
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
            <Line type="monotone" dataKey="cpuTemp" name="CPU" stroke={PC_COLORS.cpu} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="gpuTemp" name="GPU" stroke={PC_COLORS.gpu} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
