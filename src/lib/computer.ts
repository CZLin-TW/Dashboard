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

export function toChartHistory(raw: ComputerHistoryRaw[]): ComputerChartPoint[] {
  return raw.map((p) => ({
    t: p.t * 1000,
    cpu: p.cpu_pct,
    ram: p.ram_pct,
    gpu: p.gpu_pct,
    cpuTemp: p.cpu_temp_c,
    gpuTemp: p.gpu_temp_c,
  }));
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
