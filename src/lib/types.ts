// 待辦、食品列表共用的日期與緊急程度 helper（資料型別在 lib/api.ts）。

/** 分時目標濕度的一個設定點：從 hour 起套用 threshold，直到下一個設定點。 */
export interface HumidityCurvePoint {
  hour: number;
  threshold: number;
}

/** 從今天 00:00 算到 expiry（YYYY-MM-DD）還剩幾天；過期回負數。 */
export function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** 待辦 / 食品的緊急程度 — 用於 list row 的 highlight。
 *  - overdue：已過時（食品過期日 < 今天；待辦日期 < 今天，或同日且時間已過）
 *  - today：當日且尚未過時（食品過期日 = 今天；待辦今天但時間未到）
 *  - normal：一般 */
export type Urgency = "overdue" | "today" | "normal";

/** 待辦 urgency 判斷：先看日曆天，再看時間。
 *  日曆天比較簡單也避免「沒指定時間」的歧義；同一日曆天時，
 *  有時間才比對 now，沒時間就維持 today（一天還沒過）。 */
export function todoUrgency(date: string, time: string): Urgency {
  if (!date) return "normal";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() < today.getTime()) return "overdue";
  if (target.getTime() > today.getTime()) return "normal";

  // 同一日曆天
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return "today";
  const [h, m] = time.split(":").map((s) => parseInt(s, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "today";
  const dueAt = new Date(date);
  dueAt.setHours(h, m, 0, 0);
  return dueAt.getTime() < Date.now() ? "overdue" : "today";
}

/** 食品 urgency：純看過期日跟今天的日曆天差距。 */
export function foodUrgency(expiry: string): Urgency {
  const days = daysUntilExpiry(expiry);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return "normal";
}

/** 食品過期日 → 顯示用 label。home / food 共用。
 *  text：人類可讀的描述（已過期 / 今天到期 / 明天到期 / N 天後到期 / N 天後）
 *  cls：對應 Tailwind className（已過期用 warm、≤3 天用 amber semibold、其他 mute）
 *  days：原始天數差，caller 想自己判斷可用 */
export function expiryLabel(expiry: string): { text: string; cls: string; days: number } {
  const days = daysUntilExpiry(expiry);
  if (days < 0) return { text: "已過期", cls: "text-warm font-semibold", days };
  if (days === 0) return { text: "今天到期", cls: "text-amber font-semibold", days };
  if (days === 1) return { text: "明天到期", cls: "text-amber font-semibold", days };
  if (days <= 3) return { text: `${days} 天後到期`, cls: "text-amber font-semibold", days };
  return { text: `${days} 天後`, cls: "text-mute", days };
}

/** Urgency → row className（list row 用）。
 *  overdue：飽和 warm-bg + 左邊 inset bar + font-semibold（最強警示）
 *  today：amber-bg + 左邊 inset bar（次強）
 *  normal：空字串
 *  inset shadow 而不是 border-left：避免破 row 的 rounded-[12px]。 */
export function urgencyRowClass(urgency: Urgency): string {
  if (urgency === "overdue")
    return "bg-warm-bg/70 shadow-[inset_3px_0_0_var(--color-warm)] font-semibold";
  if (urgency === "today")
    return "bg-amber-bg/60 shadow-[inset_3px_0_0_var(--color-amber)]";
  return "";
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** 把日期跟今天比較，回傳人類可讀的相對描述（待辦 sub-line 用）。
 *  格式「星期·相對」，例如「四·3 天後」——只有相對描述的話，看到「3 天後」還要自己
 *  換算是禮拜幾才能對上行事曆，星期幾是排程時真正在用的座標。
 *  範圍 ±7 天內才顯示，超過回 null（caller 只顯示原始日期）。
 *  Overdue 一律「過期 N 天」（不單獨用「昨天」），語氣較急、語義跟 urgency overdue 對齊。 */
export function relativeDateLabel(date: string): string | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  // 日期字串壞掉時 days 是 NaN，下面的比較全部會是 false 而漏到最後一行印出「NaN 天後」。
  if (!Number.isFinite(days)) return null;
  if (days < -7 || days > 7) return null;
  const weekday = WEEKDAY_LABELS[target.getDay()];
  if (days < 0) return `${weekday}·過期 ${-days} 天`;
  if (days === 0) return `${weekday}·今天`;
  if (days === 1) return `${weekday}·明天`;
  if (days === 2) return `${weekday}·後天`;
  return `${weekday}·${days} 天後`;
}
