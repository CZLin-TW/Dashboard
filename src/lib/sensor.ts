// SwitchBot 感測器 monitoring 的 backend payload 型別 + chart transform。
// backend 來源：home-butler/sensor_state.py snapshot()。

export interface SensorHistoryRaw {
  t: number;                      // unix seconds
  temp: number | null;
  humidity: number | null;
  co2?: number | null;            // Meter Pro CO2 才有；一般溫濕度感測器 null
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
  co2: number | null;
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
      out.push({ t: (prevT + tMs) / 2, temp: null, humidity: null, co2: null });
    }
    out.push({ t: tMs, temp: p.temp, humidity: p.humidity, co2: p.co2 ?? null });
    prevT = tMs;
  }
  return out;
}

/** 跨多個感測器算共用 Y 範圍（round 到整數 + buffer），讓多張 chart 視覺對齊。
 *  co2Domain 只統計有 co2 值的點；沒任何 co2 sensor 時回 null。 */
export function computeSensorDomains(
  sensors: Sensor[],
): { tempDomain: [number, number]; humDomain: [number, number]; co2Domain: [number, number] | null } {
  const temps: number[] = [];
  const hums: number[] = [];
  const co2s: number[] = [];
  for (const s of sensors) {
    for (const p of s.history) {
      if (p.temp != null) temps.push(p.temp);
      if (p.humidity != null) hums.push(p.humidity);
      if (p.co2 != null) co2s.push(p.co2);
    }
    if (s.current?.temp != null) temps.push(s.current.temp);
    if (s.current?.humidity != null) hums.push(s.current.humidity);
    if (s.current?.co2 != null) co2s.push(s.current.co2);
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
  // CO2: 100 ppm 整數 + buffer；室外 ~400，室內密閉空間可飆到 2000+
  const co2Domain: [number, number] | null =
    co2s.length === 0
      ? null
      : [
          Math.max(0, Math.floor(Math.min(...co2s) / 100) * 100 - 100),
          Math.ceil(Math.max(...co2s) / 100) * 100 + 100,
        ];
  return { tempDomain, humDomain, co2Domain };
}

/** 判斷 sensor 是否為 CO2 sensor（任一筆 history 或 current 有 co2 值）。
 *  決定要不要 render 第三個 chart panel + ClimateReadout 顯示 ppm。 */
export function hasCO2(sensor: Sensor): boolean {
  if (sensor.current?.co2 != null) return true;
  return sensor.history.some((p) => p.co2 != null);
}
