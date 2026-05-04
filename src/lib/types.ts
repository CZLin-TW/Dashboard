// 首頁各區塊共用的型別與 helper。
// 把這些抽出來是因為原本 page.tsx 接近 600 行、每個 Card 內嵌一份介面，難以維護。

export interface WeatherData {
  location: string;
  city: string;
  date_label: string;
  date: string;
  wx: string;
  min_t: number | null;
  max_t: number | null;
  min_at: number | null;
  max_at: number | null;
  pop: number | null;
  observation: {
    station: string;
    temp: number | null;
    humidity: number | null;
    observed_at: string;
  } | null;
  forecast: {
    current_segment: {
      wx: string | null;
      min_t: number | null;
      max_t: number | null;
      pop: number | null;
      rh: number | null;
    };
    next_24h: {
      wx: string | null;
      min_t: number | null;
      max_t: number | null;
      pop: number | null;
    };
  };
}

export interface DeviceData {
  name: string;
  type: string;
  location?: string;
  // 來自 /api/devices/status 的即時讀值（感應器/除濕機才有）
  temperature?: number;
  humidity?: number;
  power?: boolean;
  mode?: string;
  targetHumidity?: string;
  // 來自 Sheet 的設備設定值
  buttons?: string;
  // AC 最後一次成功送出指令的快照（home-butler 寫回 Sheet 的，IR AC 沒辦法回讀真實狀態）
  lastPower?: string;
  lastTemperature?: number | string;
  lastMode?: string;
  lastFanSpeed?: string;
  lastUpdatedAt?: string;
}

export interface AcPendingState {
  power: boolean;
  temperature: number;
  mode: string;
  fanSpeed: string;
}

export interface DeviceOptions {
  ac: {
    modes: Array<{ value: string; label: string }>;
    fan_speeds: Array<{ value: string; label: string }>;
    temperature: { min: number; max: number };
  };
  dehumidifier: {
    modes: Array<{ value: string; label: string }>;
    humidity: number[];
  };
}

export interface TodoData {
  "事項": string;
  "日期": string;
  "時間": string;
  "負責人": string;
  "狀態": string;
}

export interface FoodData {
  "品名": string;
  "數量": string;
  "單位": string;
  "過期日": string;
}

export const DEFAULT_OPTIONS: DeviceOptions = {
  ac: { modes: [], fan_speeds: [], temperature: { min: 16, max: 30 } },
  dehumidifier: { modes: [], humidity: [] },
};

import {
  AirVent,
  Droplets,
  Fan,
  Thermometer,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

/** 設備類型的 lucide icon。AC 用 AirVent（不暗示冷暖），除濕機 Droplets，IR 一般是電風扇用 Fan，感應器用 Thermometer。 */
export const DEVICE_ICONS: Record<string, LucideIcon> = {
  "空調": AirVent,
  "除濕機": Droplets,
  "IR": Fan,
  "感應器": Thermometer,
};

/** 找不到對應 icon 時的 fallback。 */
export const DEVICE_ICON_FALLBACK: LucideIcon = Smartphone;


/** 從今天 00:00 算到 expiry（YYYY-MM-DD）還剩幾天；過期回負數。 */
export function daysUntilExpiry(expiry: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** 從 device.last* 欄位推導 AC 控制面板的初始 pending state。 */
export function acPendingFromDevice(device: DeviceData): AcPendingState {
  const raw = device.lastTemperature;
  const tempNum =
    typeof raw === "number" ? raw :
    typeof raw === "string" && raw.trim() !== "" ? parseInt(raw, 10) : NaN;
  return {
    power: device.lastPower === "on",
    temperature: Number.isFinite(tempNum) ? tempNum : 26,
    mode: device.lastMode || "",
    fanSpeed: device.lastFanSpeed || "",
  };
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
 *  cls：對應 Tailwind className（≤3 天用 warm semibold、其他 mute）
 *  days：原始天數差，caller 想自己判斷可用 */
export function expiryLabel(expiry: string): { text: string; cls: string; days: number } {
  const days = daysUntilExpiry(expiry);
  if (days < 0) return { text: "已過期", cls: "text-warm font-semibold", days };
  if (days === 0) return { text: "今天到期", cls: "text-warm font-semibold", days };
  if (days === 1) return { text: "明天到期", cls: "text-warm font-semibold", days };
  if (days <= 3) return { text: `${days} 天後到期`, cls: "text-warm font-semibold", days };
  return { text: `${days} 天後`, cls: "text-mute", days };
}

/** Urgency → row className（list row 用）。
 *  overdue：飽和 warm-bg + 左邊 inset bar + font-semibold（最強警示）
 *  today：較淡 warm-bg + 左邊 inset bar（次強）
 *  normal：空字串
 *  inset shadow 而不是 border-left：避免破 row 的 rounded-[12px]。 */
export function urgencyRowClass(urgency: Urgency): string {
  if (urgency === "overdue")
    return "bg-warm-bg/70 shadow-[inset_3px_0_0_var(--color-warm)] font-semibold";
  if (urgency === "today")
    return "bg-warm-bg/30 shadow-[inset_3px_0_0_var(--color-warm)]";
  return "";
}

/** 把日期跟今天比較，回傳人類可讀的相對描述（待辦 sub-line 用）。
 *  範圍 ±7 天內才顯示，超過回 null（caller 只顯示原始日期）。
 *  Overdue 一律「過期 N 天」（不單獨用「昨天」），語氣較急、語義跟 urgency overdue 對齊。 */
export function relativeDateLabel(date: string): string | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < -7 || days > 7) return null;
  if (days < 0) return `過期 ${-days} 天`;
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days === 2) return "後天";
  return `${days} 天後`;
}
