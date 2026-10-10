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

/** home-butler `GET /api/ac/auto-off` 的單台回應。`problems` 起的欄位是後端對 Sheet
 *  兩個儲存格的解讀，舊版後端沒有；沒有就不顯示設定摘要。 */
export interface AcAutoOff {
  hours: number;
  status: string;
  scheduled_at: string | null;
  problems?: string[];
  hours_text?: string;
  window_text?: string;
  /** 正規化的 "HH:MM-HH:MM"；開始與結束相同表示全天。 */
  window?: string | null;
  /** 若此刻開機會排的關機時間 "YYYY-MM-DD HH:MM"，與後端建立排程用同一段計算。 */
  preview_off_at?: string | null;
}

export interface AcAutoOffResponse {
  devices: Record<string, AcAutoOff>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function previewLabel(at: string, now: Date): string {
  const [date, time = ""] = at.split(" ");
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (date === localDate(now)) return `今天 ${time}`;
  if (date === localDate(tomorrow)) return `明天 ${time}`;
  return `${date.slice(5).replace("-", "/")} ${time}`;
}

/** 排程區那一行「後端實際讀到的自動關機設定」。填錯的儲存格放進 warnings，
 *  讓使用者不必等真的開機才發現設定沒有生效。 */
export function autoOffSummary(info: AcAutoOff | undefined, now = new Date()): { text: string; warnings: string[] } | null {
  if (!info || !Array.isArray(info.problems)) return null;
  const warnings = info.problems.map((code) => {
    if (code === "hours_unreadable") return `試算表的「自動關機小時數」填的是「${info.hours_text ?? ""}」，無法辨識（需為 0–168 的整數），目前不會自動關機。`;
    if (code === "window_unreadable") return `試算表的「自動關機暫緩時段」填的是「${info.window_text ?? ""}」，無法辨識（格式如 22:00-07:00），目前不會暫緩。`;
    if (code === "window_without_hours") return "已填暫緩時段，但「自動關機小時數」是 0 或空白，所以自動關機沒有啟用。";
    return "自動關機設定有無法辨識的內容，請檢查試算表。";
  });
  if (!info.hours) return { text: "自動關機：未啟用", warnings };
  const [start, end] = (info.window ?? "").split("-");
  const wait = !info.window ? "" : start === end ? `，一律等到 ${end}` : `，落在 ${start}–${end} 之間延到 ${end}`;
  const preview = info.preview_off_at ? `若現在開機，會排在${previewLabel(info.preview_off_at, now)} 關。` : "";
  return { text: `自動關機：開機後 ${info.hours} 小時${wait}。${preview}`, warnings };
}
