// PC 監控的 backend payload 型別 + chart 用 transform。
// backend 來源：home-butler/pc_state.py snapshot()。

export interface ComputerHistoryRaw {
  t: number;            // unix seconds（Python time.time()）
  cpu_pct: number | null;
  ram_pct: number | null;
  gpu_pct: number | null;
  cpu_temp_c: number | null;
  gpu_temp_c: number | null;
}

export interface ComputerCurrentRaw extends ComputerHistoryRaw {
  fah?: {
    paused?: boolean | null;
    finish?: boolean | null;
    units_count?: number | null;
    progress_pct?: number | null;
  } | null;
}

export interface ComputerPC {
  ip: string;
  hostname?: string;
  cpu_model?: string;
  gpu_model?: string;
  current: ComputerCurrentRaw;
  history: ComputerHistoryRaw[];
  last_heartbeat_at: number;  // unix seconds
  online: boolean;
}

// Chart 用的歷史點：時間用 ms、key 對齊 ComputerCard 既有的 Recharts dataKey。
export interface ComputerChartPoint {
  t: number;                   // unix ms
  cpu: number | null;
  ram: number | null;
  gpu: number | null;
  cpuTemp: number | null;
  gpuTemp: number | null;
}

// agent 預期每 60s push 一次。相鄰兩點時間差超過這個就視為 gap，插 null 讓
// Recharts 斷線（connectNulls={false} 配合）；不插的話 Recharts 會把跨 gap 的
// 兩點直接連長線，視覺假象（看起來那段時間都很平）。
const PC_GAP_THRESHOLD_MS = 120 * 1000;

export function toChartHistory(raw: ComputerHistoryRaw[]): ComputerChartPoint[] {
  const out: ComputerChartPoint[] = [];
  let prevT: number | null = null;
  for (const p of raw) {
    const tMs = p.t * 1000;
    if (prevT !== null && tMs - prevT > PC_GAP_THRESHOLD_MS) {
      out.push({
        t: (prevT + tMs) / 2,
        cpu: null, ram: null, gpu: null, cpuTemp: null, gpuTemp: null,
      });
    }
    out.push({
      t: tMs,
      cpu: p.cpu_pct,
      ram: p.ram_pct,
      gpu: p.gpu_pct,
      cpuTemp: p.cpu_temp_c,
      gpuTemp: p.gpu_temp_c,
    });
    prevT = tMs;
  }
  return out;
}

/** 「N 分鐘前」「剛剛」之類的相對時間（給 heartbeat label）。
 *  fromUnixSec：Python time.time() 的秒數；toMs：JS Date.now()。 */
export function relativeFromHeartbeat(fromUnixSec: number, toMs: number = Date.now()): string {
  const diffMin = Math.max(0, Math.round((toMs - fromUnixSec * 1000) / 60_000));
  if (diffMin < 1) return "剛剛回報";
  if (diffMin < 60) return `${diffMin} 分鐘前回報`;
  const h = Math.floor(diffMin / 60);
  return `${h} 小時前回報`;
}

// 配色簡化：CPU = 深海藍（用量+溫度同色）、GPU = 陶土、RAM = 赭黃。
// ComputerCard 的數值區塊與 ComputerCharts 的折線共用同一組，兩邊視覺才對得起來——
// charts 被拆成非同步 chunk（見 lazy-charts.tsx）後，放在這個不相依 recharts 的 lib
// 是唯一能同時被兩邊 import 又不會把圖表拉回初始 bundle 的位置。
export const PC_COLORS = {
  cpu: "var(--color-chart-humidity)",
  gpu: "var(--color-chart-temperature)",
  ram: "var(--color-chart-co2)",
} as const;
