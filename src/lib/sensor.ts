// SwitchBot 感測器 monitoring 的 backend payload 型別 + chart transform。
// backend 來源：home-butler/sensor_state.py snapshot()。

export interface SensorHistoryRaw {
  t: number;                      // unix seconds
  temp: number | null;
  humidity: number | null;
}

export interface SensorCurrentRaw extends SensorHistoryRaw {}

export interface Sensor {
  device_name: string;
  location?: string;
  current: SensorCurrentRaw;
  history: SensorHistoryRaw[];
  last_polled_at: number;
  online: boolean;
}

// Chart 點：時間用 ms（跟 PC 監控 chart 一致，方便共用 X axis logic）。
export interface SensorChartPoint {
  t: number;
  temp: number | null;
  humidity: number | null;
}

// home-butler polling 每 5 分鐘一次。相鄰兩點超過這個就視為 gap、插 null
// 讓 Recharts 斷線。
const SENSOR_GAP_THRESHOLD_MS = 600 * 1000;

export function toSensorChartHistory(raw: SensorHistoryRaw[]): SensorChartPoint[] {
  const out: SensorChartPoint[] = [];
  let prevT: number | null = null;
  for (const p of raw) {
    const tMs = p.t * 1000;
    if (prevT !== null && tMs - prevT > SENSOR_GAP_THRESHOLD_MS) {
      out.push({ t: (prevT + tMs) / 2, temp: null, humidity: null });
    }
    out.push({ t: tMs, temp: p.temp, humidity: p.humidity });
    prevT = tMs;
  }
  return out;
}

/** 跨多個感測器算共用 Y 範圍（round 到整數 + buffer），讓兩張 chart 視覺對齊。 */
export function computeSensorDomains(
  sensors: Sensor[],
): { tempDomain: [number, number]; humDomain: [number, number] } {
  const temps: number[] = [];
  const hums: number[] = [];
  for (const s of sensors) {
    for (const p of s.history) {
      if (p.temp != null) temps.push(p.temp);
      if (p.humidity != null) hums.push(p.humidity);
    }
    if (s.current?.temp != null) temps.push(s.current.temp);
    if (s.current?.humidity != null) hums.push(s.current.humidity);
  }
  const tempDomain: [number, number] =
    temps.length === 0
      ? [10, 35]                                   // 室內溫度合理 fallback
      : [
          Math.floor(Math.min(...temps)) - 1,
          Math.ceil(Math.max(...temps)) + 1,
        ];
  const humDomain: [number, number] =
    hums.length === 0
      ? [30, 90]                                   // 室內濕度合理 fallback
      : [
          Math.max(0, Math.floor(Math.min(...hums) / 5) * 5 - 5),
          Math.min(100, Math.ceil(Math.max(...hums) / 5) * 5 + 5),
        ];
  return { tempDomain, humDomain };
}
