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
