import { encodeLightAreaIds } from "../todo-light-areas";
import { createDemoState, dateAt, monitoring, haObservations, OPTIONS, weather, type DemoState, type Row } from "./fixtures";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Dashboard-Demo": "1" } });
const error = (message: string, status = 400) => json({ error: message }, status);
const str = (value: unknown, fallback = "") => value === undefined ? fallback : String(value);
const row = (value: unknown): Row => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const success = () => json({ ok: true, message: "模擬操作完成" });

/** An independent store per browser tab. Unknown requests never fall through to a backend. */
export function createSimulator(initial = createDemoState(), persist: (state: DemoState) => void = () => {}) {
  const state = structuredClone(initial);
  let sequence = 0;

  async function dispatch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const method = request.method;
    const read = method === "GET";
    let b: Row = {};
    if (!read && method !== "HEAD") {
      const text = await request.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return error("需要 JSON 物件");
          b = parsed;
        } catch { return error("JSON 格式錯誤"); }
      }
    }
    const value = (key: string) => b[key] ?? url.searchParams.get(key) ?? undefined;

    if (path === "/api/auth/me" && read) return json({ lineUserId: "demo-local-only", name: "測試成員", role: "member" });
    if (path === "/api/auth/logout" && method === "POST") return success();
    if (path.startsWith("/api/auth/")) return error("測試模式使用模擬身分，不提供正式登入", 403);
    if (state.scenario === "error") return error("模擬 API 失敗：請切回正常情境重試", 503);
    if (state.scenario === "offline" && (path.startsWith("/api/lighting/") || path.startsWith("/api/theater/") || (!read && path === "/api/devices/control"))) return error("模擬設備離線", 503);

    const visibleTodo = (t: { 類型?: string; 負責人?: string }) => t.類型 === "公開" || t.負責人 === "測試成員";
    const visibleTodos = state.todos.filter(t => t.狀態 === "待辦" && visibleTodo(t));
    if (read) {
      const history = () => monitoring(state);
      switch (path) {
        case "/api/home-assistant/observations": return json(haObservations(state.scenario));
        case "/api/dashboard": return json(value("include_weather") === "false"
          ? { todos: visibleTodos, food: state.food }
          : { weatherToday: weather(), weatherTomorrow: weather(), todos: visibleTodos, food: state.food });
        case "/api/devices": return json(state.devices);
        case "/api/devices/options": return json(OPTIONS);
        case "/api/devices/status": return json(Object.fromEntries(state.devices.filter(d => !value("name") || d.name === value("name")).map(d => [d.name, d])));
        case "/api/sensors/status": return json(Object.fromEntries(Object.entries(history().sensors)
          .filter(([name]) => !value("name") || name === value("name"))
          .map(([name, sensor]) => [name, value("include_history") === "false" ? { ...sensor, history: [] } : sensor])));
        case "/api/ac/status": return json(history().acs);
        case "/api/dehumidifier/history": return json(history().dehums);
        case "/api/computers/status": return json(history().computers);
        case "/api/dehumidifier/auto-rule": return json(state.rules);
        case "/api/todos": return json(visibleTodos);
        case "/api/food": return json(state.food);
        case "/api/schedules": return json(state.schedules.filter(s => ["待執行", "待確認", "執行失敗"].includes(s.狀態)));
        case "/api/recurring-todos": return json(state.recurring.filter(r => r.狀態 === "啟用" && visibleTodo(r)));
        case "/api/lighting/areas": return json({ agent_id: "home_assistant", areas: state.areas });
        case "/api/lighting/auto/rules": return json({ rules: {}, retired: true });
        case "/api/lighting/auto/sensors": return json({ sensors: state.devices.filter(d => d.type === "感應器").map(d => ({ name: d.name, location: d.location, device_id: `demo-${d.name}` })) });
        case "/api/theater/summary": return json(state.theater);
        case "/api/weather": return json(weather());
      }
      if (/^\/api\/lighting\/auto\/sensors\/[^/]+\/light-level$/.test(path)) return json({ light_level: 4, source: "home_assistant", age_seconds: 5 });
    }

    if (path === "/api/devices/control" && method === "POST") {
      const device = state.devices.find(d => d.name === b.deviceName);
      if (!device) return error("找不到模擬設備", 404);
      if (state.rules[device.name]?.auto_mode) return error("自動模式啟用中，請先關閉自動模式", 409);
      const p = row(b.params);
      if (b.action === "setAll" && device.type === "空調") {
        if (device.controlProvider === "home_assistant" && !device.available) return error("HA 空調狀態未知", 503);
        const requested = Number(p.temperature);
        if (!Number.isFinite(requested) || requested < 16 || requested > 30 || !Number.isInteger(requested * 2) || typeof p.power !== "boolean") return error("空調設定無效");
        const temp = Math.floor(requested + 0.5);   // 半度輸入 half-up 收整；目標一律整數
        Object.assign(device, { lastPower: p.power ? "on" : "off", lastTemperature: temp, lastMode: str(p.mode), lastFanSpeed: str(p.fanSpeed), lastUpdatedAt: new Date().toISOString() });
        return json({ ok: true, message: "模擬操作完成", state: device });
      } else if (b.action === "dehumidifier" && device.type === "除濕機") {
        if (typeof p.power === "boolean") device.power = p.power;
        if (typeof p.mode === "string") device.mode = p.mode;
        if (p.humidity !== undefined) device.targetHumidity = str(p.humidity);
      } else if (b.action !== "ir" || device.type !== "IR") return error("不支援此設備動作");
      return success();
    }
    if (path === "/api/dehumidifier/auto-rule" && method === "POST") {
      const device = state.devices.find(d => d.name === b.device_name && d.type === "除濕機");
      if (!device) return error("找不到除濕機", 404);
      const previous = state.rules[device.name] ?? { auto_mode: false, sensor_name: "", duration_min: 5, threshold: 55, on_mode: "連續除濕" };
      const rule = { ...previous };
      if (typeof b.auto_mode === "boolean") rule.auto_mode = b.auto_mode;
      if (b.sensor_name !== undefined) rule.sensor_name = str(b.sensor_name);
      if (b.duration_min !== undefined) rule.duration_min = Number(b.duration_min);
      if (b.threshold !== undefined) rule.threshold = Number(b.threshold);
      if (b.threshold_source !== undefined) rule.threshold_source = str(b.threshold_source);
      const sensor = state.devices.find(d => d.name === rule.sensor_name && d.type === "感應器");
      if (rule.auto_mode && !sensor) return error("請選擇感測器");
      if (!Number.isFinite(rule.threshold) || rule.threshold < 45 || rule.threshold > 65) return error("濕度門檻需介於 45–65");
      rule.effective_threshold = rule.threshold_source === "自訂" ? 55 : rule.threshold;
      rule.humidity_curve = rule.threshold_source === "自訂" ? [{ hour: 7, threshold: 55 }, { hour: 23, threshold: 60 }] : [];
      rule.humidity_on_threshold = rule.effective_threshold + 2;
      rule.humidity_off_threshold = rule.effective_threshold - 1;
      rule.auto_phase = rule.auto_mode ? "idle_humid" : "disabled";
      rule.countdown_min = null;
      if (rule.auto_mode) {
        device.power = (sensor?.humidity ?? 0) >= rule.effective_threshold;
        device.mode = device.brand === "LG" ? "智慧除濕" : "連續除濕";
      }
      state.rules[device.name] = rule;
      return json({ rule });
    }

    if (path === "/api/food") {
      if (method === "POST") {
        if (!str(b.name).trim() || !b.expiry) return error("品名與過期日必填");
        state.food.push({ 品名: str(b.name).trim(), 數量: str(b.quantity, "1"), 單位: str(b.unit, "個"), 過期日: str(b.expiry), 狀態: "有效", 新增日: dateAt(0), 新增者: "測試成員" });
        return success();
      }
      const index = state.food.findIndex(f => f.品名 === value("name"));
      if (index < 0) return error("找不到食品", 404);
      if (method === "DELETE") { state.food.splice(index, 1); return success(); }
      if (method === "PATCH") {
        const f = state.food[index];
        for (const [key, field] of Object.entries({ name_new: "品名", quantity: "數量", unit: "單位", expiry: "過期日" }) as [string, keyof typeof f][]) if (b[key] !== undefined) f[field] = str(b[key]);
        return success();
      }
    }
    if (["/api/todos", "/api/recurring-todos"].includes(path) && ["POST", "PATCH"].includes(method) && b.light_area_ids !== undefined && b.light_notify !== false) {
      if (!Array.isArray(b.light_area_ids) || !b.light_area_ids.length || b.light_area_ids.length > 32 ||
          b.light_area_ids.some(id => typeof id !== "string" || !state.areas.some(area => area.id === id.trim() && area.enabled !== false))) {
        return error("請選擇有效的提醒區域");
      }
    }
    if (path === "/api/todos") {
      if (method === "POST") {
        if (!str(b.item).trim() || !b.date) return error("事項與日期必填");
        state.todos.push({ 待辦ID: `demo-created-${Date.now()}-${sequence++}`, 事項: str(b.item).trim(), 日期: str(b.date), 時間: str(b.time), 負責人: "測試成員", 狀態: "待辦", 類型: str(b.type, "私人"), 來源: "本地", 屬性: "讀寫", 燈光提醒: b.light_notify === true, 燈光區域ID: Array.isArray(b.light_area_ids) ? encodeLightAreaIds(b.light_area_ids as string[]) : str(b.light_area_id) });
        return success();
      }
      const index = state.todos.findIndex(t => t.狀態 === "待辦" && visibleTodo(t) && (value("todo_id")
        ? t.待辦ID === value("todo_id")
        : t.事項 === value("item") && (!value("date_orig") || t.日期 === value("date_orig")) && (!value("time_orig") || t.時間 === value("time_orig"))));
      if (index < 0) return error("找不到待辦", 404);
      const t = state.todos[index];
      if (method === "DELETE" && t.來源 === "Notion") { t.狀態 = "已完成"; return success(); }
      if (t.屬性 === "唯讀") return error("外部唯讀待辦無法修改", 403);
      if (method === "DELETE") { state.todos.splice(index, 1); return success(); }
      if (method === "PATCH") {
        for (const [key, field] of Object.entries({ item_new: "事項", date: "日期", time: "時間", type: "類型", light_area_id: "燈光區域ID" })) if (b[key] !== undefined) Object.assign(t, { [field]: str(b[key]) });
        if (b.light_notify !== undefined) t.燈光提醒 = b.light_notify === true;
        if (Array.isArray(b.light_area_ids)) t.燈光區域ID = encodeLightAreaIds(b.light_area_ids as string[]);
        if (b.light_notify === false) t.燈光區域ID = "";
        return success();
      }
    }
    if (path === "/api/recurring-todos") {
      if (method === "POST") {
        if (!b.item || !b.recur_type) return error("事項與週期必填");
        state.recurring.push({ 規則ID: `demo-rule-${Date.now()}-${sequence++}`, 事項: str(b.item), 重複類型: str(b.recur_type), 星期: Array.isArray(b.weekdays) ? b.weekdays.join(",") : "", 月日: str(b.month_day), 間隔天數: str(b.interval_days), 時間: str(b.time), 負責人: "測試成員", 類型: str(b.type, "私人"), 燈光提醒: b.light_notify === true, 燈光區域ID: Array.isArray(b.light_area_ids) ? encodeLightAreaIds(b.light_area_ids as string[]) : str(b.light_area_id), 起始日期: str(b.start_date, dateAt(0)), 結束日期: str(b.end_date), 狀態: "啟用", 摘要: `${str(b.recur_type)} ${str(b.time)}（模擬模板，不自動生成）` });
        return success();
      }
      if (method === "DELETE") {
        const r = state.recurring.find(r => r.規則ID === value("rule_id") && visibleTodo(r));
        if (!r) return error("找不到週期模板", 404);
        r.狀態 = "停用";
        return success();
      }
    }
    if (path === "/api/schedules") {
      if (method === "POST") {
        if (!b.device_name || !b.trigger_time) return error("設備與時間必填");
        state.schedules.push({ 設備名稱: str(b.device_name), 觸發時間: str(b.trigger_time), 動作: str(b.target_action), 參數: JSON.stringify(b.params ?? {}), 建立者: "測試成員", 狀態: "待執行", 來源: state.devices.some(d => d.name === b.device_name && d.type === "空調" && d.controlProvider === "home_assistant") ? "使用者（HA）" : "使用者" });
        return success();
      }
      const executionId = method === "DELETE" ? value("execution_id") : "";
      const index = state.schedules.findIndex(s => s.設備名稱 === value("device_name") && s.觸發時間 === value("trigger_time")
        && (executionId ? ["執行失敗", "待確認"].includes(s.狀態) && s.執行識別碼 === executionId : s.狀態 === "待執行"));
      if (index < 0) return error("找不到排程", 404);
      const automatic = state.schedules[index].來源 === "自動（HA）";
      const metadata = row(JSON.parse(state.schedules[index].參數 || "{}"));
      if (method === "DELETE") {
        if (automatic && !metadata._auto_closed) {
          state.schedules[index].狀態 = "已取消";
          state.schedules[index].參數 = JSON.stringify({...metadata, _auto_deleted:true, _auto_paused:false});
        } else state.schedules.splice(index, 1);
        return success();
      }
      if (method === "PATCH") {
        const original = state.schedules[index];
        const finalAction = str(b.target_action_new, original.動作);
        const finalName = str(b.device_name_new, original.設備名稱);
        if (finalAction === "control_ac" && state.devices.some(d => d.name === finalName && d.controlProvider === "home_assistant")
          && !["使用者", "使用者（HA）", "自動（HA）"].includes(original.來源 ?? "")) return error("舊自動關機／防黴排程已停用，請另外新增手動排程");
        if (automatic && (finalAction !== "control_ac" || finalName !== original.設備名稱)) return error("本輪自動排程只能編輯原空調");
        for (const [key, field] of Object.entries({ device_name_new: "設備名稱", trigger_time_new: "觸發時間", target_action_new: "動作" })) if (b[key] !== undefined) state.schedules[index][field] = str(b[key]);
        if (b.params_new !== undefined) state.schedules[index].參數 = JSON.stringify(b.params_new);
        const target = state.schedules[index];
        if (automatic) {
          const params = row(JSON.parse(target.參數));
          const deviceParams = Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith("_auto_")));
          if (metadata._auto_closed) {
            target.來源 = "使用者（HA）";
            target.參數 = JSON.stringify(deviceParams);
          } else target.參數 = JSON.stringify({...deviceParams,
              ...Object.fromEntries(Object.entries(metadata).filter(([k]) => k.startsWith("_auto_"))), _auto_edited:true});
        }
        else if (target.動作 === "control_ac" && state.devices.some(d => d.name === target.設備名稱 && d.controlProvider === "home_assistant")) target.來源 = "使用者（HA）";
        else if (target.來源 === "使用者（HA）") target.來源 = "使用者";
        return success();
      }
    }

    const areaMatch = path.match(/^\/api\/lighting\/areas\/([^/]+)(?:\/(state|effect|notification))?$/);
    if (areaMatch) {
      const a = state.areas.find(a => a.id === areaMatch[1]);
      if (!a) return error("找不到照明區域", 404);
      if (!areaMatch[2] && method === "PATCH") { a.display_name = str(b.display_name) || a.hue_name; return success(); }
      if (areaMatch[2] === "state" && method === "PATCH") {
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
        return success();
      }
      if (["effect", "notification"].includes(areaMatch[2]) && method === "POST") { a.last_action = str(b.effect ?? b.notification); return success(); }
    }
    const sceneMatch = path.match(/^\/api\/lighting\/scenes\/([^/]+)\/recall$/);
    if (sceneMatch && method === "POST") {
      const a = state.areas.find(a => a.scenes.some(s => s.id === sceneMatch[1]));
      if (!a) return error("找不到場景", 404);
      a.on = true; a.brightness = sceneMatch[1].endsWith("night") ? 20 : 80;
      if (a.color_control) { a.color_control.mode = "temperature"; a.color_control.kelvin = sceneMatch[1].endsWith("night") ? 2200 : 4000; a.color_control.hs = null; } a.last_action = sceneMatch[1];
      return success();
    }
    const ruleMatch = path.match(/^\/api\/lighting\/auto\/rules\/([^/]+)$/);
    if (ruleMatch && state.areas.some(a => a.id === ruleMatch[1])) {
      if (method === "PATCH" || method === "DELETE") return error("HB 自動夜燈已停用，請在 Home Assistant 設定自動化", 410);
    }
    if (path === "/api/theater/flags" && method === "POST") {
      for (const key of ["kef_link", "tv_screen_auto", "tv_avr_sync"] as const) if (typeof b[key] === "boolean") state.theater.flags[key] = b[key];
      return json({ success: true, flags: state.theater.flags });
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
