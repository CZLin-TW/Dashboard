// 排程資料 schema + CRUD API helpers，給 /schedules 頁跟裝置卡內嵌的
// ScheduleSection 共用，避免兩處 parse/diff 邏輯漂移。
//
// Sheet 欄位是中文 key（home-butler 寫入時就是這樣）；UI 端統一用 Schedule
// 型別 [key: string]: string 接，需要哪個欄位就直接 s["設備名稱"]。

import type { DeviceData } from "@/lib/types";
import type { ScheduleFormState, ScheduleFormInitial } from "@/app/schedules/schedule-form";

export interface Schedule {
  [key: string]: string;
}

/** 從 schedule 的 params JSON 字串拆出可顯示的設定值。
 *  list row 用 display 字串，編輯展開時轉成 ScheduleFormInitial。 */
export interface ParsedParams {
  power?: "on" | "off";
  temperature?: number;
  mode?: string;
  fanSpeed?: string;
  humidity?: number;
  button?: string;
  display: string;
}

export function parseScheduleParams(rawJson: string): ParsedParams {
  const parsed: ParsedParams = { display: rawJson };
  try {
    const p = JSON.parse(rawJson);
    if (p.power === "on" || p.power === "off") parsed.power = p.power;
    if (typeof p.temperature === "number") parsed.temperature = p.temperature;
    if (typeof p.mode === "string") parsed.mode = p.mode;
    if (typeof p.fan_speed === "string") parsed.fanSpeed = p.fan_speed;
    if (typeof p.humidity === "number") parsed.humidity = p.humidity;
    if (typeof p.button === "string") parsed.button = p.button;

    const parts: string[] = [];
    if (parsed.power) parts.push(parsed.power === "off" ? "關機" : "開機");
    if (parsed.temperature !== undefined) parts.push(`${parsed.temperature}°C`);
    if (parsed.mode) parts.push(parsed.mode);
    if (parsed.fanSpeed) parts.push(`風速:${parsed.fanSpeed}`);
    if (parsed.humidity !== undefined) parts.push(`${parsed.humidity}%`);
    if (parsed.button) parts.push(parsed.button);
    if (parts.length) parsed.display = parts.join(" · ");
  } catch { /* keep raw display */ }
  return parsed;
}

/** 穩定排序的 JSON 字串，給 params diff 比對用（避免 key 順序不同造成假差異）。 */
export function stableJson(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  return JSON.stringify(sortedKeys.map((k) => [k, obj[k]]));
}

export function toFormInitial(s: Schedule, deviceData: DeviceData | undefined): ScheduleFormInitial {
  const trigger = s["觸發時間"] ?? "";
  const [date, time] = trigger.split(" ");
  const parsed = parseScheduleParams(s["參數"] ?? "");
  const initial: ScheduleFormInitial = {
    device_name: s["設備名稱"] ?? "",
    trigger_date: date ?? "",
    trigger_time: time ?? "",
  };
  if (deviceData?.type === "空調") {
    initial.ac = {
      power: parsed.power === "on",
      temperature: parsed.temperature ?? 26,
      mode: parsed.mode ?? "",
      fanSpeed: parsed.fanSpeed ?? "",
    };
  } else if (deviceData?.type === "除濕機") {
    initial.dehumidifier = {
      power: parsed.power === "on",
      mode: parsed.mode ?? "",
      humidity: parsed.humidity,
    };
  } else if (deviceData?.type === "IR") {
    initial.ir = { button: parsed.button ?? "" };
  }
  return initial;
}

// ── 觸發時間 helpers ──────────────────────────────────────

/** "YYYY-MM-DD HH:MM" → epoch ms；parse 失敗回 NaN（caller 用 isFinite 過濾）。 */
export function triggerTimeToMs(trigger: string): number {
  const t = new Date(trigger.replace(" ", "T"));
  return t.getTime();
}

export function isPastTrigger(trigger: string): boolean {
  const ms = triggerTimeToMs(trigger);
  return Number.isFinite(ms) && ms < Date.now();
}

// ── CRUD API wrappers ─────────────────────────────────────

export async function createSchedule(state: ScheduleFormState, person: string): Promise<void> {
  const res = await fetch("/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...state, person }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

/** PATCH 排程，回傳是否真的送出（沒任何欄位變動就回 false 不打 API）。 */
export async function updateSchedule(
  original: Schedule,
  state: ScheduleFormState,
  person: string,
): Promise<boolean> {
  const originalDevice = original["設備名稱"] ?? "";
  const originalTrigger = original["觸發時間"] ?? "";
  const originalAction = original["動作"] ?? "";
  const originalParamsStr = original["參數"] ?? "";

  // Diff 對齊 todo / food：只送有改動的欄位。
  const body: Record<string, unknown> = {
    device_name: originalDevice,
    trigger_time: originalTrigger,
    person,
  };
  if (state.device_name !== originalDevice) body.device_name_new = state.device_name;
  if (state.target_action !== originalAction) body.target_action_new = state.target_action;
  if (state.trigger_time !== originalTrigger) body.trigger_time_new = state.trigger_time;
  let paramsChanged = true;
  try {
    const orig = JSON.parse(originalParamsStr) as Record<string, unknown>;
    paramsChanged = stableJson(orig) !== stableJson(state.params);
  } catch { /* 原始 JSON 壞的，當作有改 */ }
  if (paramsChanged) body.params_new = state.params;

  const hasChange = "device_name_new" in body || "target_action_new" in body
    || "trigger_time_new" in body || "params_new" in body;
  if (!hasChange) return false;

  const res = await fetch("/api/schedules", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return true;
}

export async function deleteSchedule(deviceName: string, triggerTime: string): Promise<void> {
  await fetch("/api/schedules", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_name: deviceName, trigger_time: triggerTime }),
  });
}
