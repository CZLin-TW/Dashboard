// 空調狀態歷史的 backend payload 型別 + 區段 transform。
// backend 來源：home-butler/ac_history.py snapshot()。

export interface AcHistoryRaw {
  t: number;                     // unix seconds
  power: string;                 // "on" / "off" / ""
  temperature: number | null;
  mode: string;                  // 「冷氣」「暖氣」「除濕」「送風」「自動」or ""
  fan_speed: string;
}

export interface AcDevice {
  device_name: string;
  location?: string;
  current: AcHistoryRaw;
  history: AcHistoryRaw[];
  last_recorded_at: number;
}

/** 連續 power=on 的 row 在 chart 背景畫一個色塊。色塊的 mode 來自區段內最後一筆
 *  on row 的 mode（保險起見）。t 用 ms 對齊 chart X 軸。 */
export interface AcSegment {
  startT: number;       // ms
  endT: number;         // ms
  mode: string;
}

const MODE_NEUTRAL = new Set(["送風", "自動", ""]);

/** AC mode 對應到色塊填色（CSS 變數，半透明在 ReferenceArea 端設）。 */
export function modeColor(mode: string): string {
  if (mode === "冷氣") return "var(--color-cool)";
  if (mode === "暖氣") return "var(--color-amber)";
  if (mode === "除濕") return "var(--color-fresh)";
  return "var(--color-mute)";        // 送風 / 自動 / 其他
}

/** 把單一 AC 的 history 轉成「on 區段」list。
 *  - 連續 power=on 合成一個區段
 *  - 中間 mode 變化也合成同段（用最後 mode；簡化處理，視覺色塊不會頻繁變色）
 *  - 遇到 power=off 結束區段
 *  - 沒收到 off（chart 最右邊還是 on）→ 區段 endT = 最後一筆 on 的 t */
function deviceHistoryToSegments(history: AcHistoryRaw[]): AcSegment[] {
  const segs: AcSegment[] = [];
  let cur: { startT: number; endT: number; mode: string } | null = null;
  for (const p of history) {
    const tMs = p.t * 1000;
    if (p.power === "on") {
      if (!cur) {
        cur = { startT: tMs, endT: tMs, mode: p.mode || "" };
      } else {
        cur.endT = tMs;
        if (p.mode) cur.mode = p.mode;  // 用較新的 mode
      }
    } else {
      // power=off 或 ""
      if (cur) {
        segs.push(cur);
        cur = null;
      }
    }
  }
  if (cur) segs.push(cur);
  return segs;
}

/** 給某個 location，從所有 AC 中挑出符合的、合併 segments。
 *  多台同 location AC（例如客廳上下兩台）→ 各自的 segments 全收進來，
 *  Recharts ReferenceArea 重疊處 fillOpacity 會疊（視覺上「兩台都開」更深）。 */
export function getAcSegmentsForLocation(
  acsMap: Record<string, AcDevice>,
  location: string,
): AcSegment[] {
  if (!location) return [];
  const out: AcSegment[] = [];
  for (const ac of Object.values(acsMap)) {
    if (ac.location !== location) continue;
    out.push(...deviceHistoryToSegments(ac.history));
  }
  return out;
}

export { MODE_NEUTRAL };
