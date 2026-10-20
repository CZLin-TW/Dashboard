import type { LightColorState } from "../light-color";
import type { Ac, AutoOff, Computer, Dehumidifier, Food, Ir, Schedule, SensorNow, Todo, TodoTemplate, Weather, History,
  DevicesPage } from "../api";
import type { TheaterSummary } from "../theater";
import type { HaAutomationLog, HaObservation } from "../home-assistant";

export type Scenario = "normal" | "empty" | "offline" | "error";
export type Row = Record<string, unknown>;

export function dateAt(offset: number, now = Date.now()): string {
  return new Date(now + 8 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
}

export function haAutomations(scenario: Scenario, now = Date.now()): DevicesPage["automations"] {
  const online = scenario !== "offline";
  const at = (minutesAgo: number) => Math.round(now / 1000) - minutesAgo * 60;
  if (scenario === "empty") return { online, shared: false, received_at: now / 1000, rules: [], runs: [] };
  const rules: HaAutomationLog["rules"] = [
    { entity_id: "automation.demo_light_on", name: "有人就開燈", enabled: true, last_triggered: at(12) },
    { entity_id: "automation.demo_light_off", name: "沒人就關燈", enabled: true, last_triggered: at(95) },
    { entity_id: "automation.demo_ac_off", name: "沒人就關冷氣", enabled: true, last_triggered: at(26 * 60) },
    { entity_id: "automation.demo_alarm", name: "燈光鬧鐘", enabled: false, last_triggered: null },
  ];
  return { online, shared: true, received_at: now / 1000 - (online ? 0 : 180),
    rules: rules.map(rule => ({ ...rule, enabled: online ? rule.enabled : null })) as unknown as Row[],
    runs: [
      { entity_id: "automation.demo_ac_off", name: "沒人就關冷氣", at: at(26 * 60), source: "state of binary_sensor.demo_sofa" },
      { entity_id: "automation.demo_light_off", name: "沒人就關燈", at: at(95), source: "state of binary_sensor.demo_sofa" },
      { entity_id: "automation.demo_light_on", name: "有人就開燈", at: at(12), source: "state of binary_sensor.demo_sofa" },
    ] };
}

function presence(scenario: Scenario, now: number): HaObservation[] {
  const online = scenario !== "offline";
  if (scenario === "empty") return [];
  return [
    { id: "a".repeat(32), entity_id: "binary_sensor.demo_sofa", name: "沙發區", area: "客廳", kind: "occupancy", value: online ? true : null, available: online, source_updated_at: now / 1000 },
    { id: "b".repeat(32), entity_id: "binary_sensor.demo_dining", name: "餐桌區", area: "餐廳", kind: "occupancy", value: online ? false : null, available: online, source_updated_at: now / 1000 - 3600 },
    { id: "c".repeat(32), entity_id: "sensor.demo_light", name: "客廳亮度", area: "客廳", kind: "illuminance", value: online ? 128 : null, available: online, source_updated_at: now / 1000 },
  ];
}

export const AC_OPTIONS: DevicesPage["options"]["ac"] = {
  modes: [["cool", "冷氣"], ["heat", "暖氣"], ["dry", "除濕"], ["fan_only", "送風"], ["heat_cool", "自動"]].map(([value, label]) => ({ value, label })),
  fan_speeds: [["auto", "自動"], ["low", "低"], ["medium", "中"], ["high", "高"]].map(([value, label]) => ({ value, label })),
  temperature: { min: 16, max: 30 },
};

export interface DemoArea {
  id: string; area_id: number; resource_type: string; hue_resource_id: string; hue_resource_type: string;
  hue_name: string; kind: string; display_name: string; reminders: boolean; is_default: boolean;
  on: boolean; brightness: number; light_count: number;
  scenes: { id: string; name: string; resource_type: string }[];
  notifications: { key: string; label: string; kind: string; action: string }[];
  effects: { key: string; label: string; supported_count: number; total_count: number }[];
  color_control?: LightColorState;
  last_action?: string;
}

export interface DemoState {
  schema: 3; scenario: Scenario; createdAt: number; nextId: number;
  acs: Ac[]; irs: Ir[]; sensors: SensorNow[]; dehumidifiers: Dehumidifier[]; computers: Computer[];
  schedules: Schedule[]; autoOff: AutoOff[];
  todos: (Todo & { owner: string })[]; templates: (TodoTemplate & { active: boolean })[]; food: Food[];
  areas: DemoArea[]; theater: TheaterSummary;
}

const DEMO_MEMBER = "測試成員";

export function createDemoState(scenario: Scenario = "normal", now = Date.now()): DemoState {
  const empty = scenario === "empty";
  const offline = scenario === "offline";
  const iso = (msAgo = 0) => new Date(now - msAgo).toISOString();
  const local = (offset: number, time: string) => `${dateAt(offset, now)} ${time}`;
  const due = (offset: number, time: string) => new Date(`${dateAt(offset, now)}T${time}:00+08:00`).toISOString();
  const schedule = (id: number, kind: Schedule["target_kind"], name: string, params: Record<string, unknown>, offset: number, time: string,
    extra: Partial<Schedule> = {}): Schedule => ({ id, target_kind: kind, target_name: name, params, due_at: due(offset, time),
    due_local: local(offset, time), source: "user", status: "pending", status_label: "待執行", result: "", created_by: DEMO_MEMBER,
    editable: true, ...extra });
  const todo = (id: number, title: string, offset: number, extra: Partial<Todo & { owner: string }> = {}) => ({
    id, title, due_date: dateAt(offset, now), due_time: null, assignee: DEMO_MEMBER, visibility: "private" as const, status: "open" as const,
    source: "local" as const, read_only: false, light_reminder: false, light_area_ids: [], template_id: null, owner: DEMO_MEMBER, ...extra });
  const dehumidifier = (name: string, location: string, brand: "Panasonic" | "LG", power: boolean, mode: string, target: string,
    auto: boolean, sensor: string, threshold: number, humidity: number): Dehumidifier => ({
    name, location, brand, controllable: true,
    options: brand === "LG" ? { modes: ["智慧除濕", "快速除濕", "靜音除濕"], humidity: [30, 35, 40, 45, 50, 55, 60, 65, 70], humidity_needs_mode: null }
      : { modes: ["連續除濕", "防霉抑菌", "目標濕度", "空氣清淨", "AI舒適"], humidity: [40, 45, 50, 55, 60, 65, 70], humidity_needs_mode: "目標濕度" },
    status: { power: offline ? null : power, mode, target, updated_at: iso(120_000), error: offline ? "無法取得除濕機狀態" : "" },
    rule: { auto_mode: auto, sensor_name: sensor, duration_min: 5, threshold, threshold_source: "fixed", effective_threshold: threshold,
      on_at: threshold + 2, off_at: threshold - 1, phase: auto ? "armed_below" : "disabled", countdown_min: auto ? 3 : null,
      last_event: "", last_event_at: null, curve: [], curve_error: "" },
    sensor_humidity: offline ? null : humidity,
  });
  return {
    schema: 3, scenario, createdAt: now, nextId: 100,
    acs: empty ? [] : [
      { name: "客廳冷氣", location: "客廳", available: !offline, uncertain: false, power: offline ? null : "on", mode: offline ? null : "冷氣",
        temperature: offline ? null : 26, fan: offline ? null : "自動", updated_at: now / 1000 - 300 },
      { name: "書房冷氣", location: "書房", available: !offline, uncertain: false, power: offline ? null : "off", mode: null, temperature: null,
        fan: null, updated_at: now / 1000 - 3600 },
    ],
    irs: empty ? [] : [{ name: "循環扇", location: "客廳", buttons: ["電源", "風速+", "風速-", "擺頭"].map(label => ({ label, available: !offline })) }],
    sensors: empty ? [] : [
      { name: "客廳感測器", location: "客廳", available: !offline, ...(offline ? {} : { temperature: 26.4, humidity: 58, co2: 720 }) },
      { name: "臥室感測器", location: "臥室", available: !offline, ...(offline ? {} : { temperature: 25.8, humidity: 53 }) },
    ],
    dehumidifiers: empty ? [] : [
      dehumidifier("客廳除濕機", "客廳", "Panasonic", true, "連續除濕", "55%", true, "客廳感測器", 55, 58),
      dehumidifier("臥室除濕機", "臥室", "LG", false, "智慧除濕", "60%", false, "臥室感測器", 60, 53),
    ],
    computers: empty ? [] : [
      { id: 1, hostname: "DEMO-PC", ip: "192.0.2.10", cpu_model: "Demo CPU", gpu_model: "Demo GPU", online: !offline,
        last_heartbeat_at: iso(offline ? 3600_000 : 30_000), current: { cpu_pct: 30, ram_pct: 42, gpu_pct: 35, cpu_temp_c: 50, gpu_temp_c: 55 } },
      { id: 2, hostname: "Mac mini (demo)", ip: "192.0.2.20", cpu_model: "Apple M6", gpu_model: "Apple M6 GPU", online: !offline,
        last_heartbeat_at: iso(offline ? 3600_000 : 30_000), current: { cpu_pct: 18, ram_pct: 56, gpu_pct: 22, cpu_temp_c: null, gpu_temp_c: null,
          smc_temperature: { tcmb_c: 58, tcmz_c: null }, memory_pressure: { level: "normal", pct: 38 }, system_power_w: 4.2 } },
    ],
    schedules: empty ? [] : [
      schedule(1, "ac", "客廳冷氣", { power: "off" }, 1, "07:00", { source: "auto_off", created_by: "系統" }),
      schedule(2, "ac", "客廳冷氣", { power: "on", temperature: 27, mode: "cool" }, 1, "23:00"),
      schedule(3, "ac", "書房冷氣", { power: "on" }, -1, "18:00", { status: "failed", status_label: "執行失敗", editable: false,
        result: "HA 拒絕空調指令，請確認模式與設備設定" }),
      schedule(4, "ir", "循環扇", { button: "電源" }, -1, "19:00", { status: "unknown", status_label: "待確認", editable: false,
        result: "HA 遙控指令結果未確認，不會自動重送" }),
    ],
    autoOff: empty ? [] : [
      { name: "客廳冷氣", hours: 1, hours_text: "1", window_text: "07:00-07:00", window: "07:00-07:00", problems: [],
        preview_off_at: due(1, "07:00"), status: "counting", scheduled_at: due(1, "07:00") },
      { name: "書房冷氣", hours: 0, hours_text: "", window_text: "", window: null, problems: [], preview_off_at: null, status: "disabled", scheduled_at: null },
    ],
    todos: empty ? [] : [
      todo(1, "清洗冷氣濾網", -1, { due_time: "19:00", light_reminder: true, light_area_ids: [1, 2] }),
      todo(2, "倒垃圾", 0, { due_time: "20:00", visibility: "public", light_reminder: true, light_area_ids: [1], template_id: 1 }),
      todo(3, "購買洗衣精", 2, { visibility: "public" }),
      todo(4, "行事曆範例（唯讀）", 3, { source: "notion", read_only: true }),
      todo(5, "另一位成員的私人事項", 1, { assignee: "其他成員", owner: "其他成員" }),
    ],
    templates: empty ? [] : [{ id: 1, title: "倒垃圾", rule: "daily", weekdays: [], month_day: null, interval_days: null, due_time: "20:00",
      assignee: DEMO_MEMBER, visibility: "public", light_reminder: true, light_area_ids: [1], start_date: dateAt(-10, now), end_date: null,
      summary: "每天 20:00", active: true }],
    food: empty ? [] : [
      { id: 1, name: "鮮奶", quantity: 1, unit: "瓶", expires_on: dateAt(-1, now), added_on: dateAt(-5, now), added_by: DEMO_MEMBER },
      { id: 2, name: "雞蛋", quantity: 6, unit: "顆", expires_on: dateAt(0, now), added_on: dateAt(-4, now), added_by: DEMO_MEMBER },
      { id: 3, name: "蘋果", quantity: 3, unit: "顆", expires_on: dateAt(3, now), added_on: dateAt(-2, now), added_by: DEMO_MEMBER },
    ],
    areas: empty ? [] : ["客廳", "臥室"].map((name, i) => ({
      id: i === 0 ? "demo-living" : "demo-bedroom", area_id: i + 1, resource_type: "grouped_light", hue_resource_id: `demo-room-${i}`,
      hue_resource_type: "room", hue_name: name, kind: "房間", display_name: name, reminders: true, is_default: i === 0,
      on: i === 0, brightness: i === 0 ? 65 : 30, light_count: 3,
      color_control: { color_count: i === 0 ? 3 : 0, temperature_count: 3, min_kelvin: 2000, max_kelvin: 6500,
        mode: "temperature" as const, hs: null, kelvin: 3000 },
      scenes: [{ id: `demo-scene-${i}-day`, name: "日常照明", resource_type: "scene" }, { id: `demo-scene-${i}-night`, name: "柔和夜燈", resource_type: "scene" }],
      notifications: [{ key: "alert:breathe", label: "呼吸燈", kind: "alert", action: "breathe" }],
      effects: [{ key: "no_effect", label: "停止特效", supported_count: 3, total_count: 3 }, { key: "candle", label: "燭光", supported_count: 3, total_count: 3 }],
    })),
    theater: { health: { api: "ok", appletv: { sha: "demo", stale: false, updated_at: now / 1000, restore_pending: null }, update: { status: "up_to_date" } }, agent_id: "home_assistant", flags: { kef_link: true, tv_screen_auto: true, tv_avr_sync: false }, monitor: { last_avr_state: "on", last_tv_state: "active", auto_update: true }, devices: { marantz: { power: "on", source: "Apple TV", volume: 35 }, ls60: { power: "on" }, lsx2: { power: "off" } }, logs: { theater: ["[DEMO] 劇院服務已連線", "[DEMO] 此處為模擬紀錄"], appletv: ["[DEMO] Apple TV 待命"] } },
  };
}

export function devicesPage(state: DemoState, now = Date.now()): DevicesPage {
  const online = state.scenario !== "offline";
  return {
    generated_at: new Date(now).toISOString(),
    home_assistant: { connected: online, online, received_at: now / 1000 - (online ? 2 : 180), age_seconds: online ? 2 : 180,
      stale_after_seconds: 90, capabilities: online ? ["climate_control", "ir_control", "hue_control", "theater_relay"] : [] },
    acs: state.acs, irs: state.irs, sensors: state.sensors, presence: presence(state.scenario, now) as unknown as Row[],
    dehumidifiers: state.dehumidifiers, computers: state.computers,
    schedules: state.schedules.filter(s => s.status === "pending" || (["failed", "unknown", "claimed"].includes(s.status))),
    auto_off: state.autoOff, automations: haAutomations(state.scenario, now),
    options: { ac: AC_OPTIONS, schedule_targets: ["ac", "dehumidifier", "ir"] }, zone_editor: false,
  };
}

/** Relative timestamps keep fixtures useful tomorrow; no measurements come from real devices. */
export function history(state: DemoState, now = Date.now()): History {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const out: History = { sensors: {}, acs: {}, computers: {}, dehumidifiers: {} };
  for (const s of state.sensors) {
    out.sensors[s.name] = Array.from({ length: 289 }, (_, i) => ({ t: at((288 - i) * 5),
      temperature: Math.round(((s.temperature ?? 26) + Math.sin(i / 24)) * 10) / 10, humidity: Math.round((s.humidity ?? 55) + Math.sin(i / 18) * 5),
      co2: s.co2 !== undefined ? Math.round(680 + Math.sin(i / 20) * 150) : null, light_level: null }));
  }
  for (const ac of state.acs) {
    out.acs[ac.name] = Array.from({ length: 289 }, (_, i) => ({ t: at((288 - i) * 5), power: i % 90 < 65 ? "on" as const : "off" as const,
      mode: "冷氣", temperature: 26, fan: "自動" }));
  }
  for (const d of state.dehumidifiers) {
    out.dehumidifiers[d.name] = Array.from({ length: 289 }, (_, i) => ({ t: at((288 - i) * 5), power: i % 60 < 35 ? "on" as const : "off" as const, mode: d.status.mode }));
  }
  for (const c of state.computers) {
    const mac = c.id === 2;
    out.computers[String(c.id)] = Array.from({ length: 1441 }, (_, i) => ({ t: at(1440 - i),
      cpu_pct: mac ? 18 : Math.round(25 + Math.sin(i / 60) * 15), ram_pct: mac ? 56 : 42, gpu_pct: Math.round(30 + Math.sin(i / 40) * 20),
      cpu_temp: mac ? null : 48 + Math.round(Math.sin(i / 60) * 5), gpu_temp: mac ? null : 52 + Math.round(Math.sin(i / 40) * 8),
      soc_temp: mac ? 58 + Math.round(Math.sin(i / 30) * 60) / 10 : null,
      mem_pressure_pct: mac ? Math.round(35 + 8 * Math.sin(i / 17) + (i >= 1320 && i < 1400 ? 35 : 0)) : null,
      mem_pressure_level: mac ? (i >= 1370 && i < 1390 ? "critical" : i >= 1320 && i < 1400 ? "warning" : "normal") : null,
      power_w: mac ? Math.round((4 + 2.5 * Math.max(0, Math.sin(i / 30)) + (i >= 1320 && i < 1400 ? 9 : 0)) * 10) / 10 : null }));
  }
  return out;
}

export function weather(now = Date.now()): Weather {
  return { location: "示範區", city: "示範城市", date_label: "今天", date: dateAt(0, now).slice(5).replace("-", "/"), wx: "多雲時晴", min_t: 25, max_t: 31, min_at: 26, max_at: 33, pop: 30,
    observation: { station: "模擬測站", temp: 28, humidity: 65, observed_at: new Date(now + 8 * 3600_000).toISOString().slice(11, 16) },
    forecast: { current_segment: { wx: "多雲時晴", min_t: 25, max_t: 31, pop: 30, rh: 65 }, next_24h: { wx: "多雲", min_t: 24, max_t: 30, pop: 20 } } };
}

export { DEMO_MEMBER };
