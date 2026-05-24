// 除濕機 ON/OFF 歷史 backend payload 型別 + 區段 transform。
// backend 來源：home-butler/dehumidifier_history.py snapshot()。
// 用於自動模式卡片內的 24h chart 背景畫 power=on 綠色色塊。

export interface DehumHistoryRaw {
  t: number;             // unix seconds
  power: string;         // "on" / "off" / ""
}

export interface DehumDevice {
  device_name: string;
  location?: string;
  current: DehumHistoryRaw;
  history: DehumHistoryRaw[];
  last_recorded_at: number;
}

/** 連續 power=on 在 chart 背景畫一個 fresh 綠色塊。 */
export interface DehumOnSegment {
  startT: number;        // ms
  endT: number;          // ms
}

/** 給某個 location，從所有除濕機挑出符合的、合併 on 區段（給感測器卡背景斜紋用）。
 *  多台同 location 除濕機各自的區段全收進來，重疊處由斜紋 pattern 自然疊。 */
export function getDehumSegmentsForLocation(
  dehumMap: Record<string, DehumDevice>,
  location: string,
): DehumOnSegment[] {
  if (!location) return [];
  const out: DehumOnSegment[] = [];
  for (const dh of Object.values(dehumMap)) {
    if (dh.location !== location) continue;
    out.push(...dehumHistoryToSegments(dh.history));
  }
  return out;
}

/** 把單一除濕機的 history 轉成「on 區段」list。同 ac.ts deviceHistoryToSegments 邏輯。 */
export function dehumHistoryToSegments(history: DehumHistoryRaw[]): DehumOnSegment[] {
  const segs: DehumOnSegment[] = [];
  let cur: { startT: number; endT: number } | null = null;
  for (const p of history) {
    const tMs = p.t * 1000;
    if (p.power === "on") {
      if (!cur) {
        cur = { startT: tMs, endT: tMs };
      } else {
        cur.endT = tMs;
      }
    } else {
      if (cur) {
        segs.push(cur);
        cur = null;
      }
    }
  }
  if (cur) segs.push(cur);
  return segs;
}
