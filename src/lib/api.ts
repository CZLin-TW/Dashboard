// HomeButler v2 as the browser sees it (through /api/hb). Field names follow the backend; ids are
// numbers; times with a date are ISO strings in UTC, wall-clock times are "HH:MM", dates "YYYY-MM-DD".

export const HB = (path: string) => `/api/hb/${path}`;

export interface Todo {
  id: number;
  title: string;
  due_date: string | null;
  due_time: string | null;
  assignee: string | null;
  visibility: "private" | "public";
  status: "open" | "done";
  source: "local" | "notion";
  read_only: boolean;
  light_reminder: boolean;
  light_area_ids: number[];
  template_id: number | null;
}

export type RecurrenceRule = "daily" | "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly" | "every_n_days";

export interface TodoTemplate {
  id: number;
  title: string;
  rule: RecurrenceRule;
  weekdays: number[];
  month_day: number | null;
  interval_days: number | null;
  due_time: string | null;
  assignee: string | null;
  visibility: "private" | "public";
  light_reminder: boolean;
  light_area_ids: number[];
  start_date: string;
  end_date: string | null;
  summary: string;
}

export interface LightAreaChoice { id: number; name: string; is_default: boolean }

export interface TodoPage { todos: Todo[]; templates: TodoTemplate[]; light_areas: LightAreaChoice[]; members: string[] }

export interface Food { id: number; name: string; quantity: number; unit: string; expires_on: string | null; added_on: string | null; added_by: string | null }

export interface HomePage { todos: Todo[]; food: Food[] }

export interface Weather {
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
  observation: { station: string; temp: number | null; humidity: number | null; observed_at: string } | null;
  forecast: {
    current_segment: { wx: string | null; min_t: number | null; max_t: number | null; pop: number | null; rh: number | null };
    next_24h: { wx: string | null; min_t: number | null; max_t: number | null; pop: number | null };
  };
}

/** An AC as HA reports it. power/mode/temperature/fan are null while unknown (offline, or last command unconfirmed). */
export interface Ac {
  name: string;
  location: string;
  available: boolean;
  uncertain: boolean;
  power: "on" | "off" | null;
  mode: string | null;
  temperature: number | null;
  fan: string | null;
  updated_at: number | null;
}

export interface Ir { name: string; location: string; buttons: { label: string; available: boolean }[] }

export interface SensorNow {
  name: string;
  location: string;
  available: boolean;
  temperature?: number;
  humidity?: number;
  co2?: number;
  light_level?: number;
}

export interface Dehumidifier {
  name: string;
  location: string;
  brand: "Panasonic" | "LG";
  controllable: boolean;
  /** What may be chosen on this brand; humidity applies only in humidity_needs_mode when that is set. */
  options: { modes: string[]; humidity: number[]; humidity_needs_mode: string | null };
  status: { power: boolean | null; mode: string; target: string; updated_at: string | null; error: string };
  rule: {
    auto_mode: boolean;
    sensor_name: string;
    duration_min: number;
    threshold: number;
    threshold_source: "fixed" | "custom";
    effective_threshold: number;
    on_at: number;
    off_at: number;
    phase: string;
    countdown_min: number | null;
    last_event: string;
    last_event_at: string | null;
    curve: { hour: number; threshold: number }[];
    curve_error: string;
  };
  sensor_humidity: number | null;
}

export interface Computer {
  id: number;
  hostname: string;
  ip: string;
  cpu_model: string;
  gpu_model: string;
  online: boolean;
  last_heartbeat_at: string | null;
  current: Record<string, unknown>;
}

export interface Schedule {
  id: number;
  target_kind: "ac" | "ir" | "dehumidifier";
  target_name: string;
  params: Record<string, unknown>;
  due_at: string;
  due_local: string;
  source: "user" | "auto_off";
  status: "pending" | "claimed" | "done" | "failed" | "unknown" | "expired" | "cancelled";
  status_label: string;
  result: string;
  created_by: string;
  editable: boolean;
}

export interface AutoOff {
  name: string;
  hours: number;
  hours_text: string;
  window_text: string;
  window: string | null;
  problems: string[];
  preview_off_at: string | null;
  status: string;
  scheduled_at: string | null;
}

export interface HaAutomationRule { id: string; name: string; enabled: boolean | null; last_triggered?: string | null }

export interface DevicesPage {
  generated_at: string;
  /** Every room the devices are in, in the household's order (shared by the family, set on the devices page). */
  rooms: string[];
  home_assistant: { connected: boolean; online: boolean; received_at: number | null; age_seconds: number | null;
    stale_after_seconds: number; capabilities: string[] };
  acs: Ac[];
  irs: Ir[];
  sensors: SensorNow[];
  presence?: Record<string, unknown>[];
  dehumidifiers: Dehumidifier[] | null;
  computers: Computer[];
  schedules: Schedule[];
  auto_off: AutoOff[];
  automations: { online: boolean; shared: boolean; received_at: number | null; rules: Record<string, unknown>[]; runs: Record<string, unknown>[] };
  options: { ac: { modes: { value: string; label: string }[]; fan_speeds: { value: string; label: string }[];
    temperature: { min: number; max: number } }; schedule_targets: string[] };
  zone_editor?: boolean;
}

export interface History {
  sensors: Record<string, { t: string; temperature: number | null; humidity: number | null; co2: number | null; light_level: number | null }[]>;
  acs: Record<string, { t: string; power: "on" | "off"; mode: string; temperature: number | null; fan: string }[]>;
  computers: Record<string, Record<string, number | string | null>[]>;
  dehumidifiers: Record<string, { t: string; power: "on" | "off"; mode: string }[]>;
}

/** Sends a change to HomeButler; resolves with its answer, or rejects with its message. */
export async function send<T = unknown>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await fetch(HB(path), {
    method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("session:expired"));
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(typeof data?.error === "string" ? data.error : "操作失敗，請稍後重試。") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

/** "N 秒前" / "N 分鐘前" for a moment the page last knew something. */
export function ago(moment: string | number | null | undefined, now = Date.now()): string {
  if (moment === null || moment === undefined || moment === "") return "未知";
  const at = typeof moment === "number" ? (moment < 1e12 ? moment * 1000 : moment) : Date.parse(moment);
  if (!Number.isFinite(at)) return "未知";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}
