// 純前端 mockup 用的假資料 generator。
// 之後接後端時這檔會被刪掉、改從 /api/computers/status 之類的端點拉。
//
// Deterministic：同一 IP 永遠生同一份歷史，避免每次 reload 圖表抖動誤以為是 bug。
// 走 mulberry32 seeded PRNG + walking random，曲線比 sin wave 自然、又比 pure noise 順。

const NUM_POINTS = 144; // 24h / 10min
const STEP_MS = (24 * 60 * 60 * 1000) / NUM_POINTS;

export interface ComputerHistoryPoint {
  t: number; // unix ms
  cpu: number;
  gpu: number;
  ram: number;
  cpuTemp: number;
  gpuTemp: number;
}

export interface ComputerSnapshot {
  cpuPct: number;
  gpuPct: number;
  ramPct: number;
  cpuTempC: number;
  gpuTempC: number;
  lastHeartbeatAt: number;
  online: boolean;
}

export interface ComputerMockData {
  ip: string;
  history: ComputerHistoryPoint[];
  current: ComputerSnapshot;
}

function hashIp(ip: string): number {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function walk(prev: number, rng: () => number, min: number, max: number, jitter: number): number {
  const next = prev + (rng() - 0.5) * jitter * 2;
  return Math.max(min, Math.min(max, next));
}

export function generateComputerMock(ip: string): ComputerMockData {
  const rng = mulberry32(hashIp(ip));
  // 起始值：F@H 在跑的合理基線（GPU 重載、CPU 中載、RAM 一半多）
  let cpu = 38 + rng() * 8;
  let gpu = 82 + rng() * 8;
  let ram = 55 + rng() * 6;

  const points: ComputerHistoryPoint[] = [];
  const now = Date.now();
  const baseT = now - (NUM_POINTS - 1) * STEP_MS;

  for (let i = 0; i < NUM_POINTS; i++) {
    cpu = walk(cpu, rng, 25, 60, 4);
    gpu = walk(gpu, rng, 65, 95, 3);
    ram = walk(ram, rng, 45, 70, 2);
    // 溫度跟用量正相關，再疊一點獨立抖動
    const cpuTemp = 50 + (cpu - 25) * 0.3 + (rng() - 0.5) * 2;
    const gpuTemp = 60 + (gpu - 65) * 0.4 + (rng() - 0.5) * 2;
    points.push({
      t: baseT + i * STEP_MS,
      cpu: Math.round(cpu),
      gpu: Math.round(gpu),
      ram: Math.round(ram),
      cpuTemp: Math.round(cpuTemp),
      gpuTemp: Math.round(gpuTemp),
    });
  }

  const last = points[points.length - 1];
  return {
    ip,
    history: points,
    current: {
      cpuPct: last.cpu,
      gpuPct: last.gpu,
      ramPct: last.ram,
      cpuTempC: last.cpuTemp,
      gpuTempC: last.gpuTemp,
      lastHeartbeatAt: last.t,
      online: true,
    },
  };
}

/** 「N 分鐘前」「剛剛」之類的相對時間（給 heartbeat label）。 */
export function relativeMinutes(from: number, to: number = Date.now()): string {
  const diffMin = Math.max(0, Math.round((to - from) / 60000));
  if (diffMin < 1) return "剛剛回報";
  if (diffMin < 60) return `${diffMin} 分鐘前回報`;
  const h = Math.floor(diffMin / 60);
  return `${h} 小時前回報`;
}
