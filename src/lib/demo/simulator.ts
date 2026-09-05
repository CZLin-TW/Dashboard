import { createDemoState, dateAt, monitoring, OPTIONS, weather, type DemoState, type Row } from "./fixtures";

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

    if (read) {
      const history = () => monitoring(state);
      switch (path) {
        case "/api/dashboard": return json({ weatherToday: weather(), weatherTomorrow: weather(), todos: state.todos, food: state.food });
        case "/api/devices": return json(state.devices);
        case "/api/devices/options": return json(OPTIONS);
        case "/api/devices/status": return json(Object.fromEntries(state.devices.filter(d => !value("name") || d.name === value("name")).map(d => [d.name, d])));
        case "/api/sensors/status": return json(history().sensors);
        case "/api/ac/status": return json(history().acs);
        case "/api/dehumidifier/history": return json(history().dehums);
        case "/api/computers/status": return json(history().computers);
        case "/api/dehumidifier/auto-rule": return json(state.rules);
        case "/api/todos": return json(state.todos);
        case "/api/food": return json(state.food);
        case "/api/schedules": return json(state.schedules);
        case "/api/recurring-todos": return json(state.recurring.filter(r => r.狀態 === "啟用"));
        case "/api/lighting/areas": return json({ agent_id: "DEMO-PC", areas: state.areas });
        case "/api/lighting/auto/rules": return json({ rules: state.lightingRules });
        case "/api/lighting/auto/sensors": return json({ sensors: state.devices.filter(d => d.type === "感應器").map(d => ({ name: d.name, location: d.location, device_id: `demo-${d.name}` })) });
        case "/api/theater/summary": return json(state.theater);
        case "/api/weather": return json(weather());
      }
      if (/^\/api\/lighting\/auto\/sensors\/[^/]+\/light-level$/.test(path)) return json({ light_level: 4, source: "webhook", age_seconds: 5 });
    }

    if (path === "/api/devices/control" && method === "POST") {
      const device = state.devices.find(d => d.name === b.deviceName);
      if (!device) return error("找不到模擬設備", 404);
      if (state.rules[device.name]?.auto_mode) return error("自動模式啟用中，請先關閉自動模式", 409);
      const p = row(b.params);
      if (b.action === "setAll" && device.type === "空調") {
        const temp = Number(p.temperature);
        if (!Number.isFinite(temp) || temp < 16 || temp > 30 || typeof p.power !== "boolean") return error("空調設定無效");
        Object.assign(device, { lastPower: p.power ? "on" : "off", lastTemperature: temp, lastMode: str(p.mode), lastFanSpeed: str(p.fanSpeed), lastUpdatedAt: new Date().toISOString() });
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
    if (path === "/api/todos") {
      if (method === "POST") {
        if (!str(b.item).trim() || !b.date) return error("事項與日期必填");
        state.todos.push({ 事項: str(b.item).trim(), 日期: str(b.date), 時間: str(b.time), 負責人: "測試成員", 狀態: "待辦", 類型: str(b.type, "私人"), 來源: "本地", 屬性: "讀寫", 燈光提醒: b.light_notify === true, 燈光區域ID: str(b.light_area_id) });
        return success();
      }
      const index = state.todos.findIndex(t => t.事項 === value("item") && (value("date_orig") === undefined || t.日期 === value("date_orig")) && (value("time_orig") === undefined || t.時間 === value("time_orig")));
      if (index < 0) return error("找不到待辦", 404);
      const t = state.todos[index];
      if (t.屬性 === "唯讀") return error("外部唯讀待辦無法修改", 403);
      if (method === "DELETE") { state.todos.splice(index, 1); return success(); }
      if (method === "PATCH") {
        for (const [key, field] of Object.entries({ item_new: "事項", date: "日期", time: "時間", type: "類型", light_area_id: "燈光區域ID" })) if (b[key] !== undefined) Object.assign(t, { [field]: str(b[key]) });
        if (b.light_notify !== undefined) t.燈光提醒 = b.light_notify === true;
        return success();
      }
    }
    if (path === "/api/recurring-todos") {
      if (method === "POST") {
        if (!b.item || !b.recur_type) return error("事項與週期必填");
        state.recurring.push({ 規則ID: `demo-rule-${Date.now()}-${sequence++}`, 事項: str(b.item), 重複類型: str(b.recur_type), 星期: Array.isArray(b.weekdays) ? b.weekdays.join(",") : "", 月日: str(b.month_day), 間隔天數: str(b.interval_days), 時間: str(b.time), 負責人: "測試成員", 類型: str(b.type, "私人"), 起始日期: str(b.start_date, dateAt(0)), 結束日期: str(b.end_date), 狀態: "啟用", 摘要: `${str(b.recur_type)} ${str(b.time)}（模擬模板，不自動生成）` });
        return success();
      }
      if (method === "DELETE") {
        const r = state.recurring.find(r => r.規則ID === value("rule_id"));
        if (!r) return error("找不到週期模板", 404);
        r.狀態 = "停用";
        return success();
      }
    }
    if (path === "/api/schedules") {
      if (method === "POST") {
        if (!b.device_name || !b.trigger_time) return error("設備與時間必填");
        state.schedules.push({ 設備名稱: str(b.device_name), 觸發時間: str(b.trigger_time), 動作: str(b.target_action), 參數: JSON.stringify(b.params ?? {}), 建立者: "測試成員", 狀態: "待執行", 來源: "使用者" });
        return success();
      }
      const index = state.schedules.findIndex(s => s.設備名稱 === value("device_name") && s.觸發時間 === value("trigger_time"));
      if (index < 0) return error("找不到排程", 404);
      if (method === "DELETE") { state.schedules.splice(index, 1); return success(); }
      if (method === "PATCH") {
        for (const [key, field] of Object.entries({ device_name_new: "設備名稱", trigger_time_new: "觸發時間", target_action_new: "動作" })) if (b[key] !== undefined) state.schedules[index][field] = str(b[key]);
        if (b.params_new !== undefined) state.schedules[index].參數 = JSON.stringify(b.params_new);
        return success();
      }
    }

    const areaMatch = path.match(/^\/api\/lighting\/areas\/([^/]+)(?:\/(state|effect|notification))?$/);
    if (areaMatch) {
      const a = state.areas.find(a => a.id === areaMatch[1]);
      if (!a) return error("找不到照明區域", 404);
      if (!areaMatch[2] && method === "PATCH") { a.display_name = str(b.display_name) || a.hue_name; return success(); }
      if (areaMatch[2] === "state" && method === "PATCH") {
        if (typeof b.on === "boolean") a.on = b.on;
        if (typeof b.brightness === "number") { a.brightness = Math.max(1, Math.min(100, b.brightness)); a.on = true; }
        return success();
      }
      if (["effect", "notification"].includes(areaMatch[2]) && method === "POST") { a.last_action = str(b.effect ?? b.notification); return success(); }
    }
    const sceneMatch = path.match(/^\/api\/lighting\/scenes\/([^/]+)\/recall$/);
    if (sceneMatch && method === "POST") {
      const a = state.areas.find(a => a.scenes.some(s => s.id === sceneMatch[1]));
      if (!a) return error("找不到場景", 404);
      a.on = true; a.brightness = sceneMatch[1].endsWith("night") ? 20 : 80; a.last_action = sceneMatch[1];
      return success();
    }
    const ruleMatch = path.match(/^\/api\/lighting\/auto\/rules\/([^/]+)$/);
    if (ruleMatch && state.areas.some(a => a.id === ruleMatch[1])) {
      if (method === "PATCH") { state.lightingRules[ruleMatch[1]] = structuredClone(b); return json({ rule: b }); }
      if (method === "DELETE") { delete state.lightingRules[ruleMatch[1]]; return success(); }
    }
    if (path === "/api/theater/flags" && method === "POST") {
      for (const key of ["kef_link", "tv_screen_auto", "tv_avr_sync"] as const) if (typeof b[key] === "boolean") state.theater.flags[key] = b[key];
      return json({ flags: state.theater.flags });
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
