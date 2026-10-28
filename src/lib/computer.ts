// PC 監控的 backend payload 型別 + chart 用 transform。
// backend 來源：home-butler/pc_state.py snapshot()。

export interface ComputerHistoryRaw {
  t: number;            // unix seconds（Python time.time()）
  cpu_pct: number | null;
  ram_pct: number | null;
  gpu_pct: number | null;
  cpu_temp_c: number | null;
  gpu_temp_c: number | null;
  /** Mac：tcmb_c 是整顆 SoC 的熱點溫度（CPU／GPU 同一晶片，不分開）；tcmz_c 不使用。 */
  smc_temperature?: { tcmb_c: number | null; tcmz_c: number | null } | null;
  memory_pressure?: { level: "normal" | "warning" | "critical" | null; pct?: number | null } | null;
  /** Mac：整機功耗（SMC PSTR，瓦），每分鐘取約一秒的平均。 */
  system_power_w?: number | null;
}

/** 主機上默默在跑的小服務（Mac：`~/Services/watchdogs` 的 `status --json`，經 HA 與 HomeButler 原樣轉來）。 */
export interface WatchdogRaw {
  name: string;
  healthy: boolean;
  last_line?: string | null;
  /** 最近一次「動手」的那行紀錄（例如重開 Funnel、啟動 HA 核心），開頭是本機時間 `YYYY-MM-DD HH:MM:SS`。 */
  last_action?: string | null;
  paused?: boolean;
}

export interface ComputerCurrentRaw extends ComputerHistoryRaw {
  watchdogs?: WatchdogRaw[] | null;
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
  socTemp: number | null;
  power: number | null;
  pressure: number | null;
  pressureColor: string;
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
        cpu: null, ram: null, gpu: null, cpuTemp: null, gpuTemp: null, socTemp: null, power: null, pressure: null, pressureColor: "#94a3b8",
      });
    }
    out.push({
      t: tMs,
      cpu: p.cpu_pct,
      ram: p.ram_pct,
      gpu: p.gpu_pct,
      cpuTemp: p.cpu_temp_c,
      gpuTemp: p.gpu_temp_c,
      socTemp: validSocTemperature(p.smc_temperature?.tcmb_c),
      power: validSystemPower(p.system_power_w),
      pressure: validMemoryPressure(p.memory_pressure?.pct),
      pressureColor: memoryPressureColor(p.memory_pressure?.level),
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

// 配色簡化：CPU = 深海藍（用量+溫度同色）、GPU = 陶土、RAM／記憶體壓力 = 青綠。
// SoC 溫度沿用全站「溫度」的陶土色（與環境感測的溫度圖一致）；Mac 的溫度圖只有這一條線。
// ComputerCard 的數值區塊與 ComputerCharts 的折線共用同一組，兩邊視覺才對得起來——
// charts 被拆成非同步 chunk（見 lazy-charts.tsx）後，放在這個不相依 recharts 的 lib
// 是唯一能同時被兩邊 import 又不會把圖表拉回初始 bundle 的位置。
export const PC_COLORS = {
  cpu: "var(--color-chart-humidity)",
  gpu: "var(--color-chart-temperature)",
  ram: "var(--color-chart-memory)",
  soc: "var(--color-chart-temperature)",
  // 整機功耗是 Mac 才有的獨立一張圖（收在「更多圖表」），用深海藍。
  power: "var(--color-chart-humidity)",
} as const;

/** Missing or invalid metrics are unavailable, never zero or a unit-bearing placeholder. */
export function formatComputerMetric(value: number | null | undefined, unit: "%" | "°C"): string {
  return value == null || !Number.isFinite(value) ? "unavailable" : `${Math.round(value)}${unit}`;
}

export function validSocTemperature(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 150 ? value : null;
}

export function validSystemPower(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 500 ? value : null;
}

/** 功耗軸的上限：至少 10 W，往上取到 5 W 的倍數，讓閒置時的幾瓦不會貼在底部也不會被放大成雜訊。 */
export function powerAxisMax(points: { power: number | null }[]): number {
  const peak = Math.max(0, ...points.map((p) => p.power ?? 0));
  return Math.max(10, Math.ceil(peak / 5) * 5);
}

/** Severity is independent of the continuous numeric reading. */
export function memoryPressureDisplay(level: unknown): { label: string; color: string } {
  switch (level) {
    case "normal": return { label: "正常", color: "text-emerald-700 dark:text-emerald-400" };
    case "warning": return { label: "警告", color: "text-amber-700 dark:text-amber-400" };
    case "critical": return { label: "嚴重", color: "text-red-700 dark:text-red-400" };
    default: return { label: "未知", color: "text-mute" };
  }
}

export function validMemoryPressure(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

export function memoryPressureColor(level: unknown): string {
  return level === "normal" ? "#10b981" : level === "warning" ? "#f59e0b" : level === "critical" ? "#ef4444" : "#94a3b8";
}

// ── 背景服務（看門狗與轉送）────────────────────────────────────────────
// 卡片上列出來，是為了讓人記得這些服務存在、看得出哪個停了。名稱不在表裡的照原名顯示。
const WATCHDOG_INFO: Record<string, { label: string; role: string }> = {
  "funnel": { label: "外網通道看門狗", role: "外網連不到時重開 Funnel" },
  "ha-core": { label: "HA 看門狗", role: "HA 核心停了就把它啟動" },
  "ha-webhook-relay": { label: "SwitchBot 轉送", role: "把 SwitchBot 的推送轉給 HA" },
  "mac-metrics": { label: "Mac 監控", role: "讓 HA 讀這台的狀態" },
};

export type WatchdogState = "ok" | "paused" | "down" | "unknown";

export interface WatchdogView {
  name: string;
  label: string;
  role: string | null;
  state: WatchdogState;
  /** 上次動手的時間，例如「10/26 04:12」；沒動過手是 null。 */
  lastAction: string | null;
}

const STAMP = /^\d{4}-(\d\d)-(\d\d) (\d\d):(\d\d)/;

/** 沒有回報背景服務（例如 Windows）回 null；電腦離線時狀態一律是 unknown，不沿用舊的「正常」。 */
export function watchdogViews(raw: unknown, online: boolean): WatchdogView[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((w): w is WatchdogRaw => typeof w?.name === "string" && w.name !== "").map((w) => {
    const info = WATCHDOG_INFO[w.name];
    const stamp = typeof w.last_action === "string" ? STAMP.exec(w.last_action) : null;
    return {
      name: w.name,
      label: info?.label ?? w.name,
      role: info?.role ?? null,
      state: !online ? "unknown" : w.paused === true ? "paused" : w.healthy === true ? "ok" : "down",
      lastAction: stamp ? `${Number(stamp[1])}/${Number(stamp[2])} ${stamp[3]}:${stamp[4]}` : null,
    };
  });
}

/** 卡片上的一行摘要：全部正常只說數量；有狀況就點名。 */
export function watchdogSummary(views: WatchdogView[]): { state: WatchdogState; text: string } | null {
  if (views.length === 0) return null;
  if (views.some((v) => v.state === "unknown")) return { state: "unknown", text: "背景服務：電腦離線，狀態未知" };
  const problems = views.filter((v) => v.state !== "ok");
  if (problems.length === 0) return { state: "ok", text: `背景服務 ${views.length} 個都正常` };
  const state = problems.some((v) => v.state === "down") ? "down" : "paused";
  return { state, text: `背景服務：${problems.map((v) => `${v.label}${watchdogStateLabel(v.state)}`).join("、")}` };
}

export function watchdogStateLabel(state: WatchdogState): string {
  return state === "ok" ? "正常" : state === "paused" ? "已暫停" : state === "down" ? "沒在跑" : "未知";
}

export function watchdogDotClass(state: WatchdogState): string {
  return state === "ok" ? "bg-fresh" : state === "paused" ? "bg-amber-500" : state === "down" ? "bg-red-500" : "bg-mute";
}
