import { createDemoState, dateAt, devicesPage, history, weather, DEMO_MEMBER, type DemoState, type Row } from "./fixtures";
import type { Schedule } from "../api";

// Simulates HomeButler's /v2 API as the browser sees it (/api/hb/...). Same answers and refusals as the
// real one in the cases the pages rely on; anything not simulated is refused, never sent anywhere.

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Dashboard-Demo": "1" } });
const error = (message: string, status = 400) => json({ error: message }, status);
const str = (value: unknown, fallback = "") => value === undefined || value === null ? fallback : String(value);
const AC_LABEL: Record<string, string> = { cool: "冷氣", heat: "暖氣", dry: "除濕", fan_only: "送風", heat_cool: "自動" };
const FAN_LABEL: Record<string, string> = { auto: "自動", low: "低", medium: "中", high: "高" };
const STATUS_LABEL: Record<Schedule["status"], string> = { pending: "待執行", claimed: "處理中", done: "已執行", failed: "執行失敗",
  unknown: "待確認", expired: "已過期", cancelled: "已取消" };

/** An independent store per browser tab. Unknown requests never fall through to a backend. */
export function createSimulator(initial = createDemoState(), persist: (state: DemoState) => void = () => {}) {
  const state = structuredClone(initial);
  const nextId = () => state.nextId++;

  async function dispatch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const method = request.method;
    let b: Row = {};
    if (method !== "GET" && method !== "HEAD") {
      const text = await request.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error("需要 JSON 物件");
          b = parsed;
        } catch { return error("JSON 格式錯誤"); }
      }
    }

    if (path === "/api/auth/me" && method === "GET") return json({ lineUserId: "demo-local-only", name: DEMO_MEMBER, role: "member" });
    if (path === "/api/auth/logout" && method === "POST") return json({ ok: true });
    if (path.startsWith("/api/auth/")) return error("測試模式使用模擬身分，不提供正式登入", 403);
    if (!path.startsWith("/api/hb/")) return error(`測試模式尚未模擬：${method} ${path}`, 501);
    if (state.scenario === "error") return error("模擬 API 失敗：請切回正常情境重試", 503);
    const p = path.slice("/api/hb/".length);
    const offline = state.scenario === "offline";
    const deviceCommand = /^(devices\/(ac|ir)|dehumidifiers\/[^/]+\/control|lighting\/|theater)/.test(p) && method !== "GET";
    if (offline && (deviceCommand || p === "lighting" || p === "theater")) return error("模擬設備離線", 503);
    const visible = state.todos.filter(t => t.status === "open" && (t.visibility === "public" || t.owner === DEMO_MEMBER));
    const clean = <T extends { owner?: string }>(t: T) => { const { owner, ...rest } = t; void owner; return rest; };

    if (method === "GET") {
      switch (p) {
        case "devices": return json(devicesPage(state));
        case "history": return json(history(state));
        case "home": return json({ todos: visible.filter(t => t.due_date && t.due_date <= dateAt(5)).slice(0, 5).map(clean),
          food: state.food.filter(f => f.expires_on && f.expires_on <= dateAt(5)) });
        case "todos": return json({ todos: visible.map(clean), templates: state.templates.filter(t => t.active).map(({ active, ...t }) => { void active; return t; }),
          light_areas: state.areas.filter(a => a.reminders).map(a => ({ id: a.area_id, name: a.display_name || a.hue_name, is_default: a.is_default })),
          members: [DEMO_MEMBER, "其他成員"] });
        case "food": return json({ food: state.food });
        case "weather": return json(weather());
        case "lighting": return json({ areas: state.areas });
        case "theater": return json(state.theater);
      }
      if (p.startsWith("history")) return json(history(state));
      return error(`測試模式尚未模擬：${method} ${path}`, 501);
    }

    // ── devices ──
    let m = p.match(/^devices\/ac\/(.+)$/);
    if (m && method === "POST") {
      const ac = state.acs.find(a => a.name === m![1]);
      if (!ac) return error("找不到「" + m[1] + "」", 409);
      if (b.power === "off") Object.assign(ac, { power: "off", mode: null, temperature: null, fan: null });
      else {
        const t = Number(b.temperature ?? ac.temperature ?? 26);
        if (!Number.isFinite(t) || t < 16 || t > 30) return error("空調溫度需介於 16 至 30 度", 409);
        Object.assign(ac, { power: "on", temperature: Math.floor(t + 0.5), mode: AC_LABEL[str(b.mode, "cool")] ?? "冷氣", fan: FAN_LABEL[str(b.fan_speed, "auto")] ?? "自動" });
      }
      ac.updated_at = Date.now() / 1000;
      return json({ status: "success", message: "HA 已執行" });
    }
    m = p.match(/^devices\/ir\/(.+)$/);
    if (m && method === "POST") {
      const ir = state.irs.find(i => i.name === m![1]);
      if (!ir || !ir.buttons.some(x => x.label === b.button)) return error("找不到這個按鈕", 409);
      return json({ status: "success", message: "已送出" });
    }

    // ── room order ──
    if (p === "rooms/order" && method === "PUT") {
      const rooms = Array.isArray(b.rooms) ? b.rooms.map(r => str(r).trim()) : null;
      if (!rooms || rooms.some(r => !r) || new Set(rooms).size !== rooms.length) return error("房間名稱不可空白或重複", 422);
      state.roomOrder = rooms;
      return json({ rooms });
    }

    // ── dehumidifiers ──
    m = p.match(/^dehumidifiers\/(.+)\/(control|rule)$/);
    if (m) {
      const unit = state.dehumidifiers.find(d => d.name === m![1]);
      if (!unit) return error("找不到這台除濕機", 404);
      if (m[2] === "control" && method === "POST") {
        if (unit.rule.auto_mode) return error(`${unit.name} 目前處於自動模式，請先關閉自動模式才能手動控制`, 409);
        if (b.power === "off") unit.status.power = false;
        else unit.status.power = true;
        if (typeof b.mode === "string") unit.status.mode = b.mode;
        if (typeof b.humidity === "number") unit.status.target = `${b.humidity}%`;
        unit.status.updated_at = new Date().toISOString();
        return json({ status: "success", message: `${unit.name} 指令已送出` });
      }
      if (m[2] === "rule" && method === "PUT") {
        const rule = unit.rule;
        if (typeof b.threshold === "number" && (b.threshold < 30 || b.threshold > 80)) return error("目標濕度需介於 30%～80%", 422);
        if (b.sensor_name !== undefined) rule.sensor_name = str(b.sensor_name);
        if (typeof b.duration_min === "number") rule.duration_min = b.duration_min;
        if (typeof b.threshold === "number") { rule.threshold = b.threshold; rule.threshold_source = "fixed"; }
        if (b.threshold_source === "custom" || b.threshold_source === "fixed") rule.threshold_source = b.threshold_source;
        const turningOn = b.auto_mode === true && !rule.auto_mode;
        rule.auto_mode = b.auto_mode === true;
        rule.effective_threshold = rule.threshold_source === "custom" ? 55 : rule.threshold;
        rule.curve = rule.threshold_source === "custom" ? [{ hour: 7, threshold: 55 }, { hour: 23, threshold: 60 }] : [];
        rule.on_at = rule.effective_threshold + 2;
        rule.off_at = rule.effective_threshold - 1;
        rule.phase = rule.auto_mode ? "idle_humid" : "disabled";
        if (turningOn && unit.sensor_humidity !== null) {
          unit.status.power = unit.sensor_humidity >= rule.effective_threshold;
          rule.last_event = unit.status.power ? "toggled_immediate_on" : "toggled_immediate_off";
        }
        return json(unit);
      }
    }

    // ── schedules ──
    if (p === "schedules" && method === "POST") {
      const kind = b.target_kind as Schedule["target_kind"];
      const name = str(b.target_name);
      const exists = (kind === "ac" && state.acs.some(a => a.name === name)) || (kind === "ir" && state.irs.some(i => i.name === name))
        || (kind === "dehumidifier" && state.dehumidifiers.some(d => d.name === name));
      if (!exists) return error("找不到這台設備", 409);
      const match = str(b.due_local).match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
      if (!match) return error("時間格式請用 YYYY-MM-DD HH:MM", 409);
      const s: Schedule = { id: nextId(), target_kind: kind, target_name: name, params: (b.params ?? {}) as Record<string, unknown>,
        due_at: new Date(`${match[1]}T${match[2]}:00+08:00`).toISOString(), due_local: str(b.due_local), source: "user", status: "pending",
        status_label: STATUS_LABEL.pending, result: "", created_by: DEMO_MEMBER, editable: true };
      state.schedules.push(s);
      return json(s);
    }
    m = p.match(/^schedules\/(\d+)$/);
    if (m) {
      const s = state.schedules.find(x => x.id === Number(m![1]));
      if (!s) return error("找不到這筆排程", 404);
      if (method === "PATCH") {
        if (s.status !== "pending") return error("這筆排程已經不是待執行，不能修改", 409);
        if (b.due_local !== undefined) {
          const match = str(b.due_local).match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
          if (!match) return error("時間格式請用 YYYY-MM-DD HH:MM", 409);
          s.due_local = str(b.due_local);
          s.due_at = new Date(`${match[1]}T${match[2]}:00+08:00`).toISOString();
        }
        if (b.params !== undefined) s.params = b.params as Record<string, unknown>;
        return json(s);
      }
      if (method === "DELETE") {
        if (s.status === "pending") { s.status = "cancelled"; s.editable = false; }
        else if (s.status === "failed" || s.status === "unknown") state.schedules = state.schedules.filter(x => x !== s);
        else return error("這筆排程不能移除", 409);
        s.status_label = STATUS_LABEL[s.status];
        return json(s);
      }
    }

    // ── to-dos ──
    const areaIds = (value: unknown) => {
      if (value === undefined) return true;
      return Array.isArray(value) && value.length > 0 && value.every(id => state.areas.some(a => a.area_id === id && a.reminders));
    };
    if (p === "todos" && method === "POST") {
      if (!str(b.title).trim() || !b.due_date) return error("事項與日期必填", 409);
      if (b.light_reminder && !areaIds(b.light_area_ids)) return error("請選擇有效的提醒區域", 409);
      const t = { id: nextId(), title: str(b.title).trim(), due_date: str(b.due_date), due_time: b.due_time ? str(b.due_time) : null,
        assignee: DEMO_MEMBER, visibility: b.visibility === "public" ? "public" as const : "private" as const, status: "open" as const,
        source: "local" as const, read_only: false, light_reminder: b.light_reminder === true && !!b.due_time,
        light_area_ids: b.light_reminder ? (b.light_area_ids as number[]) ?? [] : [], template_id: null, owner: DEMO_MEMBER };
      state.todos.push(t);
      return json({ message: `✅ 已新增待辦：${t.title}`, item: clean(t) });
    }
    m = p.match(/^todos\/(\d+)(\/complete)?$/);
    if (m) {
      const t = visible.find(x => x.id === Number(m![1]));
      if (!t) return error("❌ 找不到可操作的待辦，請重新查詢待辦清單後指定項目。", 409);
      if (m[2] && method === "POST") { t.status = "done"; return json({ message: `✅ 已標記「${t.title}」為已完成` }); }
      if (method === "PATCH") {
        if (t.read_only) return error(`❌ 「${t.title}」是外部行事曆的項目，請到原本的日曆上操作`, 409);
        if (b.light_area_ids !== undefined && !areaIds(b.light_area_ids)) return error("請選擇有效的提醒區域", 409);
        if (b.title !== undefined) t.title = str(b.title);
        if (b.due_date !== undefined) t.due_date = str(b.due_date);
        if (b.due_time !== undefined) t.due_time = b.due_time ? str(b.due_time) : null;
        if (b.visibility === "public" || b.visibility === "private") t.visibility = b.visibility;
        if (typeof b.light_reminder === "boolean") t.light_reminder = b.light_reminder && !!t.due_time;
        if (Array.isArray(b.light_area_ids)) t.light_area_ids = b.light_area_ids as number[];
        if (!t.light_reminder) t.light_area_ids = [];
        return json({ message: `✅ 已更新「${t.title}」`, item: clean(t) });
      }
    }
    if (p === "todo-templates" && method === "POST") {
      if (!str(b.title).trim() || !b.rule) return error("事項與週期必填", 409);
      state.templates.push({ id: nextId(), title: str(b.title), rule: b.rule as never, weekdays: (b.weekdays as number[]) ?? [],
        month_day: (b.month_day as number) ?? null, interval_days: (b.interval_days as number) ?? null, due_time: b.due_time ? str(b.due_time) : null,
        assignee: DEMO_MEMBER, visibility: b.visibility === "public" ? "public" : "private", light_reminder: b.light_reminder === true,
        light_area_ids: (b.light_area_ids as number[]) ?? [], start_date: str(b.start_date, dateAt(0)), end_date: b.end_date ? str(b.end_date) : null,
        summary: `${str(b.rule)} ${str(b.due_time)}（模擬模板，不自動生成）`, active: true });
      return json({ message: "✅ 已設定週期提醒" });
    }
    m = p.match(/^todo-templates\/(\d+)$/);
    if (m && method === "DELETE") {
      const t = state.templates.find(x => x.id === Number(m![1]) && x.active);
      if (!t) return error("❌ 找不到啟用中的週期提醒", 409);
      t.active = false;
      return json({ message: `✅ 已停止週期提醒：${t.title}` });
    }

    // ── food ──
    if (p === "food" && method === "POST") {
      if (!str(b.name).trim()) return error("❌ 請告訴我食品的名稱", 409);
      state.food.push({ id: nextId(), name: str(b.name).trim(), quantity: Number(b.quantity ?? 1), unit: str(b.unit, "個"),
        expires_on: b.expires_on ? str(b.expires_on) : null, added_on: dateAt(0), added_by: DEMO_MEMBER });
      return json({ message: "✅ 已新增" });
    }
    m = p.match(/^food\/(\d+)$/);
    if (m) {
      const f = state.food.find(x => x.id === Number(m![1]));
      if (!f) return error("❌ 找不到這項食品", 409);
      if (method === "DELETE" || (method === "PATCH" && typeof b.quantity === "number" && b.quantity <= 0)) {
        state.food = state.food.filter(x => x !== f);
        return json({ message: `✅ 已標記 ${f.name} 為已消耗` });
      }
      if (method === "PATCH") {
        if (b.name !== undefined) f.name = str(b.name);
        if (typeof b.quantity === "number") f.quantity = b.quantity;
        if (b.unit !== undefined) f.unit = str(b.unit);
        if (b.expires_on !== undefined) f.expires_on = str(b.expires_on);
        return json({ message: `✅ ${f.name} 已更新` });
      }
    }

    // ── lighting ──
    m = p.match(/^lighting\/areas\/(\d+)$/);
    if (m && method === "PATCH") {
      const a = state.areas.find(x => x.area_id === Number(m![1]));
      if (!a) return error("找不到這個照明區域", 404);
      if (b.display_name !== undefined) a.display_name = str(b.display_name).trim();
      if (typeof b.reminders === "boolean") a.reminders = b.reminders;
      if (b.is_default === true) state.areas.forEach(x => { x.is_default = x === a; });
      return json({ area_id: a.area_id, display_name: a.display_name, reminders: a.reminders, is_default: a.is_default });
    }
    m = p.match(/^lighting\/scenes\/([^/]+)\/recall$/);
    if (m && method === "POST") {
      const a = state.areas.find(x => x.scenes.some(s => s.id === m![1]));
      if (!a) return error("找不到場景", 404);
      a.on = true; a.brightness = m[1].endsWith("night") ? 20 : 80;
      if (a.color_control) { a.color_control.mode = "temperature"; a.color_control.kelvin = m[1].endsWith("night") ? 2200 : 4000; a.color_control.hs = null; }
      a.last_action = m[1];
      return json({ ok: true });
    }
    m = p.match(/^lighting\/([^/]+)\/(state|effect|notification)$/);
    if (m) {
      const a = state.areas.find(x => x.id === m![1]);
      if (!a) return error("找不到照明區域", 404);
      if (m[2] === "state" && method === "PATCH") {
        const c = a.color_control;
        const hs = b.hs_color, kelvin = b.color_temp_kelvin;
        if (hs !== undefined && kelvin !== undefined) return error("請選擇彩色或白光", 422);
        if (hs !== undefined && (!c?.color_count || !Array.isArray(hs) || hs.length !== 2 ||
          !hs.every(v => typeof v === "number" && Number.isFinite(v)) || hs[0] < 0 || hs[0] > 360 || hs[1] < 0 || hs[1] > 100)) return error("不支援的顏色", 422);
        if (kelvin !== undefined && (!c?.temperature_count || typeof kelvin !== "number" || !Number.isInteger(kelvin) ||
          c.min_kelvin === null || c.max_kelvin === null || kelvin < c.min_kelvin || kelvin > c.max_kelvin)) return error("不支援的色溫", 422);
        if (typeof b.on === "boolean") a.on = b.on;
        if (typeof b.brightness === "number") a.brightness = Math.max(1, Math.min(100, b.brightness));
        if (c && Array.isArray(hs)) { c.mode = "color"; c.hs = [hs[0], hs[1]]; c.kelvin = null; }
        if (c && typeof kelvin === "number") { c.mode = "temperature"; c.kelvin = Math.round(1000000 / Math.round(1000000 / kelvin)); c.hs = null; }
        return json({ ok: true });
      }
      if (m[2] !== "state" && method === "POST") { a.last_action = str(b.effect ?? b.notification); return json({ ok: true }); }
    }

    // ── theater ──
    if (p === "theater/flags" && method === "POST") {
      for (const key of ["kef_link", "tv_screen_auto", "tv_avr_sync"] as const) if (typeof b[key] === "boolean") state.theater.flags[key] = b[key];
      return json({ agent_id: "home_assistant", success: true, flags: state.theater.flags });
    }
    return error(`測試模式尚未模擬：${method} ${path}`, 501);
  }

  return {
    snapshot: () => structuredClone(state),
    async handle(request: Request) {
      if (request.signal.aborted) throw request.signal.reason;
      const response = await dispatch(request);
      if (response.ok && request.method !== "GET") persist(structuredClone(state));
      return response;
    },
  };
}

/** Pass non-API framework/assets traffic through; all API traffic is sandboxed. */
export function demoFetch(simulator: ReturnType<typeof createSimulator>, origin: string, original: typeof fetch): typeof fetch {
  return async (input, init) => {
    const target = input instanceof Request ? input.url : String(input);
    const url = new URL(target, origin);
    if (url.origin !== origin) return error("測試模式禁止外部 fetch", 403);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const request = input instanceof Request ? new Request(input, init) : new Request(url, init);
      return simulator.handle(request);
    }
    return original(input, init);
  };
}
