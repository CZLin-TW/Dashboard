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

export const DEVICE_ICONS: Record<string, string> = {
  "空調": "❄️",
  "IR": "🌀",
  "除濕機": "💨",
};

/** 把 CWA 天氣現象文字對應到 emoji，比對順序由強到弱（雷最緊急、多雲最輕）。*/
export function wxEmoji(wx: string | null | undefined): string {
  if (!wx) return "🌤️";
  if (wx.includes("雷")) return "⛈️";
  if (wx.includes("雨")) return "🌧️";
  if (wx.includes("雪")) return "❄️";
  if (wx.includes("霧")) return "🌫️";
  if (wx.includes("陰")) return "☁️";
  if (wx.includes("多雲")) return "⛅";
  if (wx.includes("晴")) return "☀️";
  return "🌤️";
}

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
