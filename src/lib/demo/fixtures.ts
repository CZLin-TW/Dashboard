import type { DeviceData, DeviceOptions, TodoData, FoodData, RecurringRule, DehumidifierAutoRule, WeatherData } from "../types";
import type { Schedule } from "../schedule";
import type { Sensor } from "../sensor";
import type { AcDevice } from "../ac";
import type { DehumDevice } from "../dehumidifier";
import type { ComputerPC } from "../computer";
import type { TheaterSummary } from "../theater";

export type Scenario = "normal" | "empty" | "offline" | "error";
export type Row = Record<string, unknown>;

export function dateAt(offset: number, now = Date.now()): string {
  return new Date(now + 8 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
}

const choices = (values: string[]) => values.map(value => ({ value, label: value }));
export const OPTIONS: DeviceOptions = {
  ac: { modes: choices(["冷氣", "除濕", "送風", "暖氣", "自動"]), fan_speeds: choices(["自動", "低", "中", "高"]), temperature: { min: 16, max: 30 } },
  dehumidifier: {
    modes: choices(["連續除濕", "目標濕度", "乾衣"]), humidity: [40, 45, 50, 55, 60, 65, 70],
    byBrand: {
      Panasonic: { modes: choices(["連續除濕", "目標濕度", "乾衣"]), humidity: [40, 45, 50, 55, 60, 65, 70] },
      LG: { modes: choices(["智慧除濕", "快速除濕", "靜音除濕"]), humidity: [40, 45, 50, 55, 60, 65, 70] },
    },
  },
};

export interface DemoArea {
  id: string; resource_type: string; hue_resource_id: string; hue_resource_type: string;
  hue_name: string; kind: string; display_name: string; on: boolean; brightness: number; light_count: number;
  scenes: { id: string; name: string; resource_type: string }[];
  notifications: { key: string; label: string; kind: string; action: string }[];
  effects: { key: string; label: string; supported_count: number; total_count: number }[];
  last_action?: string;
}

export interface DemoState {
  schema: 1; scenario: Scenario; createdAt: number;
  devices: DeviceData[]; todos: TodoData[]; food: (FoodData & { 狀態: string; 新增日: string; 新增者: string })[];
  recurring: RecurringRule[]; schedules: Schedule[]; rules: Record<string, DehumidifierAutoRule>;
  areas: DemoArea[]; lightingRules: Record<string, Row>; theater: TheaterSummary;
}

export function createDemoState(scenario: Scenario = "normal", now = Date.now()): DemoState {
  const devices: DeviceData[] = [
    { name: "客廳冷氣", type: "空調", location: "客廳", lastPower: "on", lastTemperature: 26, lastMode: "冷氣", lastFanSpeed: "自動" },
    { name: "客廳除濕機", type: "除濕機", brand: "Panasonic", location: "客廳", power: true, mode: "連續除濕", targetHumidity: "55" },
    { name: "臥室除濕機", type: "除濕機", brand: "LG", location: "臥室", power: false, mode: "智慧除濕", targetHumidity: "60" },
    { name: "循環扇", type: "IR", location: "客廳", buttons: "電源,風速+,風速-,擺頭" },
    { name: "客廳感測器", type: "感應器", location: "客廳", temperature: 26.4, humidity: 58 },
    { name: "臥室感測器", type: "感應器", location: "臥室", temperature: 25.8, humidity: 53 },
  ];
  const todo = (item: string, offset: number, extra: Partial<TodoData> = {}): TodoData => ({
    事項: item, 日期: dateAt(offset, now), 時間: "", 負責人: "測試成員", 狀態: "待辦", 類型: "私人", 來源: "本地", 屬性: "讀寫", ...extra,
  });
  return {
    schema: 1, scenario, createdAt: now, devices: scenario === "empty" ? [] : devices,
    todos: scenario === "empty" ? [] : [
      todo("清洗冷氣濾網", -1), todo("倒垃圾", 0, { 時間: "20:00", 類型: "公開", 燈光提醒: true, 燈光區域ID: "demo-living", 規則ID: "demo-daily" }),
      todo("購買洗衣精", 2, { 類型: "公開" }), todo("行事曆範例（唯讀）", 3, { 來源: "Notion", 屬性: "唯讀" }),
      todo("另一位成員的私人事項", 1, { 負責人: "其他成員" }),
    ],
    food: scenario === "empty" ? [] : [
      { 品名: "鮮奶", 數量: "1", 單位: "瓶", 過期日: dateAt(-1, now), 狀態: "有效", 新增日: dateAt(-5, now), 新增者: "測試成員" },
      { 品名: "雞蛋", 數量: "6", 單位: "顆", 過期日: dateAt(0, now), 狀態: "有效", 新增日: dateAt(-4, now), 新增者: "測試成員" },
      { 品名: "蘋果", 數量: "3", 單位: "顆", 過期日: dateAt(3, now), 狀態: "有效", 新增日: dateAt(-2, now), 新增者: "測試成員" },
    ],
    recurring: scenario === "empty" ? [] : [{ 規則ID: "demo-daily", 事項: "倒垃圾", 重複類型: "每天", 時間: "20:00", 負責人: "測試成員", 類型: "公開", 狀態: "啟用", 摘要: "每天 20:00" }],
    schedules: scenario === "empty" ? [] : [{ 設備名稱: "客廳冷氣", 動作: "control_ac", 參數: '{"power":"off"}', 觸發時間: `${dateAt(1, now)} 23:00`, 建立者: "測試成員", 狀態: "待執行", 來源: "使用者" }],
    rules: scenario === "empty" ? {} : {
      "客廳除濕機": { auto_mode: true, sensor_name: "客廳感測器", duration_min: 5, threshold: 55, effective_threshold: 55, humidity_on_threshold: 57, humidity_off_threshold: 54, on_mode: "連續除濕", auto_phase: "armed_below", countdown_min: 3 },
      "臥室除濕機": { auto_mode: false, sensor_name: "臥室感測器", duration_min: 5, threshold: 60, on_mode: "智慧除濕", auto_phase: "disabled" },
    },
    areas: scenario === "empty" ? [] : ["客廳", "臥室"].map((name, i) => ({
      id: i === 0 ? "demo-living" : "demo-bedroom", resource_type: "grouped_light", hue_resource_id: `demo-room-${i}`, hue_resource_type: "room",
      hue_name: name, kind: "房間", display_name: name, on: i === 0, brightness: i === 0 ? 65 : 30, light_count: 3,
      scenes: [{ id: `demo-scene-${i}-day`, name: "日常照明", resource_type: "scene" }, { id: `demo-scene-${i}-night`, name: "柔和夜燈", resource_type: "scene" }],
      notifications: [{ key: "alert:breathe", label: "呼吸燈", kind: "alert", action: "breathe" }],
      effects: [{ key: "candle", label: "燭光", supported_count: 3, total_count: 3 }],
    })),
    lightingRules: {},
    theater: { agent_id: "DEMO-PC", flags: { kef_link: true, tv_screen_auto: true, tv_avr_sync: false }, monitor: { last_avr_state: "on", last_tv_state: "active", auto_update: true }, devices: { marantz: { power: "on", source: "Apple TV", volume: 35 }, ls60: { power: "on" }, lsx2: { power: "off" } }, logs: { theater: ["[DEMO] 劇院服務已連線", "[DEMO] 此處為模擬紀錄"], appletv: ["[DEMO] Apple TV 待命"] } },
  };
}

/** Relative timestamps keep fixtures useful tomorrow; no measurements come from real devices. */
export function monitoring(state: DemoState, now = Date.now()) {
  const t = Math.floor(now / 1000);
  const sensors: Record<string, Sensor> = {};
  const acs: Record<string, AcDevice> = {};
  const dehums: Record<string, DehumDevice> = {};
  for (const d of state.devices) {
    if (d.type === "感應器") {
      const history = Array.from({ length: 289 }, (_, i) => ({ t: t - (288 - i) * 300, temp: Math.round(((d.temperature ?? 26) + Math.sin(i / 24)) * 10) / 10, humidity: Math.round((d.humidity ?? 55) + Math.sin(i / 18) * 5), co2: d.location === "客廳" ? Math.round(680 + Math.sin(i / 20) * 150) : null }));
      sensors[d.name] = { device_name: d.name, location: d.location, current: history[288], history, online: state.scenario !== "offline", last_polled_at: state.scenario === "offline" ? t - 3600 : t };
    }
    if (d.type === "空調") {
      const current = { t, power: d.lastPower ?? "off", temperature: Number(d.lastTemperature), mode: d.lastMode ?? "冷氣", fan_speed: d.lastFanSpeed ?? "自動" };
      acs[d.name] = { device_name: d.name, location: d.location, current, last_recorded_at: t, history: Array.from({ length: 289 }, (_, i) => ({ ...current, t: t - (288 - i) * 300, power: i === 288 ? current.power : i % 90 < 65 ? "on" : "off" })) };
    }
    if (d.type === "除濕機") {
      const current = { t, power: d.power ? "on" : "off" };
      dehums[d.name] = { device_name: d.name, location: d.location, current, last_recorded_at: t, history: Array.from({ length: 289 }, (_, i) => ({ t: t - (288 - i) * 300, power: i === 288 ? current.power : i % 60 < 35 ? "on" : "off" })) };
    }
  }
  const history = Array.from({ length: 1441 }, (_, i) => ({ t: t - (1440 - i) * 60, cpu_pct: Math.round(25 + Math.sin(i / 60) * 15), ram_pct: 42, gpu_pct: Math.round(30 + Math.sin(i / 40) * 20), cpu_temp_c: 48 + Math.round(Math.sin(i / 60) * 5), gpu_temp_c: 52 + Math.round(Math.sin(i / 40) * 8) }));
  const computers: Record<string, ComputerPC> = state.scenario === "empty" ? {} : { "192.0.2.10": { ip: "192.0.2.10", hostname: "DEMO-PC", cpu_model: "Demo CPU", gpu_model: "Demo GPU", current: history[1440], history, last_heartbeat_at: state.scenario === "offline" ? t - 3600 : t, online: state.scenario !== "offline" } };
  return { sensors, acs, dehums, computers };
}

export function weather(now = Date.now()): WeatherData {
  return { location: "示範區", city: "示範城市", date_label: "今天", date: dateAt(0, now), wx: "多雲時晴", min_t: 25, max_t: 31, min_at: 26, max_at: 33, pop: 30,
    observation: { station: "模擬測站", temp: 28, humidity: 65, observed_at: new Date(now + 8 * 3600_000).toISOString().slice(11, 16) },
    forecast: { current_segment: { wx: "多雲時晴", min_t: 25, max_t: 31, pop: 30, rh: 65 }, next_24h: { wx: "多雲", min_t: 24, max_t: 30, pop: 20 } } };
}
