"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HumidityCurvePoint } from "@/lib/types";

// 自訂分時目標濕度的 24h 預覽圖。取代原本那段文字說明——曲線畫得出來就代表格式對，
// 畫不出來直接顯示錯誤原因，使用者手改 Sheet 後看一眼就知道有沒有寫對。
//
// 曲線語意是「階梯」而非連續變化：某個小時設定的值一路維持到下一個設定點，所以用
// type="stepAfter"。循環語意（最後一段跨午夜延伸）在 buildSeries 裡展開成 0→24 的
// 完整一天，圖上就不必再解釋「為什麼 0 點有值」。

interface Props {
  /** 後端解析好的曲線點（小時 + 目標濕度），已依小時排序 */
  curve: HumidityCurvePoint[];
  /** 後端回的解析錯誤；非空代表曲線不可用 */
  error?: string;
  /** 曲線失效時實際採用的固定門檻，錯誤訊息裡標出來 */
  fallbackThreshold: number;
}

/** 把曲線點展開成畫得出來的一天：補 0 點（值＝跨午夜延伸的最後一段）與 24 點收尾。 */
function buildSeries(curve: HumidityCurvePoint[]) {
  const last = curve[curve.length - 1].threshold;
  const first = curve[0];
  const points = [
    // 第一個設定點若不在 0 點，0~它之間由最後一段跨午夜延伸過來
    ...(first.hour > 0 ? [{ hour: 0, threshold: last }] : []),
    ...curve.map((p) => ({ hour: p.hour, threshold: p.threshold })),
    { hour: 24, threshold: last }, // stepAfter 需要收尾點才畫得到最後一段
  ];
  return points;
}

function formatHour(h: number): string {
  return `${String(h % 24).padStart(2, "0")}:00`;
}

/** 從 domain 算出固定 5% 間隔的 Y 軸刻度。不交給 Recharts 自動挑——它會依範圍
 *  挑出 47.5 之類的非整數倍刻度，濕度看起來會很怪（同 sensor-chart / auto-mode-chart）。 */
function makeYTicks([lo, hi]: [number, number], step = 5): number[] {
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    ticks.push(v);
  }
  return ticks;
}

export function HumidityCurveChart({ curve, error, fallbackThreshold }: Props) {
  if (error || curve.length === 0) {
    return (
      <p className="w-full text-[11px] leading-snug text-warm">
        ⚠️ 濕度控制規則{error ? `：${error}` : "未設定"}
        <span className="text-faint">
          （暫用固定 {fallbackThreshold}%。格式 <span className="num">7=55, 23=60</span>
          ，寫在「智能居家」分頁該感應器的「濕度控制規則」欄）
        </span>
      </p>
    );
  }

  const data = buildSeries(curve);
  const values = data.map((p) => p.threshold);
  // 上下各留 5% buffer 並對齊 5 的倍數，讓水平線不會貼在圖框邊緣
  const yDomain: [number, number] = [
    Math.max(0, Math.floor(Math.min(...values) / 5) * 5 - 5),
    Math.min(100, Math.ceil(Math.max(...values) / 5) * 5 + 5),
  ];
  const nowHour = new Date().getHours();

  return (
    <div className="w-full">
      <h4 className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
        分時目標濕度{" "}
        <span className="font-normal normal-case tracking-normal">
          (% · 虛線 = 現在)
        </span>
      </h4>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            stroke="var(--color-line)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 24]}
            ticks={[0, 6, 12, 18, 24]}
            tickFormatter={formatHour}
            tick={{ fontSize: 10, fill: "var(--color-mute)" }}
            stroke="var(--color-line)"
          />
          <YAxis
            domain={yDomain}
            ticks={makeYTicks(yDomain)}
            interval={0}
            tick={{ fontSize: 10, fill: "var(--color-mute)" }}
            stroke="var(--color-line)"
            width={40}
            unit="%"
          />
          <ReferenceLine
            x={nowHour}
            stroke="var(--color-mute)"
            strokeDasharray="4 3"
            ifOverflow="hidden"
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelFormatter={(h) => `${formatHour(Number(h))} 起`}
            formatter={(v) => [`${v}%`, "目標濕度"]}
          />
          <Line
            type="stepAfter"
            dataKey="threshold"
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
