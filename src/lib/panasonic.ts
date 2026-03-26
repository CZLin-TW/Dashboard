const API_BASE = "https://ems2.panasonic.com.tw/api";
const APP_TOKEN = "D8CBFF4C-2824-4342-B22D-189166FEF503";

let cpToken = "";
let refreshToken = "";

async function login(): Promise<void> {
  const res = await fetch(`${API_BASE}/userlogin1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "okhttp/4.9.1" },
    body: JSON.stringify({
      MemId: process.env.PANASONIC_ACCOUNT ?? "",
      PW: process.env.PANASONIC_PASSWORD ?? "",
      AppToken: APP_TOKEN,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  cpToken = data.CPToken ?? "";
  refreshToken = data.RefreshToken ?? "";
}

async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/RefreshToken1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "user-agent": "okhttp/4.9.1" },
      body: JSON.stringify({ RefreshToken: refreshToken }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json();
    if (data.CPToken) {
      cpToken = data.CPToken;
      refreshToken = data.RefreshToken ?? refreshToken;
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

async function ensureToken(): Promise<void> {
  if (!cpToken) await login();
}

async function apiRequest(
  method: string,
  path: string,
  opts: { body?: unknown; params?: Record<string, string | number>; headers?: Record<string, string> } = {}
): Promise<Record<string, unknown> | null> {
  await ensureToken();

  const doRequest = async () => {
    let url = `${API_BASE}${path}`;
    if (opts.params) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.params)) qs.set(k, String(v));
      url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "user-agent": "okhttp/4.9.1",
        cptoken: cpToken,
        ...opts.headers,
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 417) {
      const body = await res.json();
      const stateMsg = body?.StateMsg ?? "";
      if (stateMsg.includes("RefreshToken") || stateMsg.includes("CPToken") || stateMsg.includes("逎時")) {
        return null;
      }
    }

    if (res.status === 200) return res.json();
    return null;
  };

  let data = await doRequest();

  if (data === null) {
    const refreshed = await doRefresh();
    if (!refreshed) await login();
    data = await doRequest();
  }

  return data;
}

const STATUS_COMMANDS = ["0x00", "0x01", "0x04", "0x09", "0x0d", "0x0e"];

const MODE_MAP: Record<string, number> = {
  "連續除濕": 0, "自動除濕": 1, "防黴": 2, "送風": 3,
  "目標濕度": 6, "空氣清淨": 7, "AI舒適": 8,
  "省電": 9, "快速除濕": 10, "靜音除濕": 11,
};

const MODE_DISPLAY: Record<string, string> = {
  "0": "連續除濕", "1": "自動除濕", "2": "防黴", "3": "送風",
  "4": "ECONAVI", "5": "保乾", "6": "目標濕度", "7": "空氣清淨",
  "8": "AI舒適", "9": "省電", "10": "快速除濕", "11": "靜音除濕",
};

const HUMIDITY_MAP: Record<number, number> = {
  40: 0, 45: 1, 50: 2, 55: 3, 60: 4, 65: 5, 70: 6,
};

const HUMIDITY_DISPLAY: Record<string, number> = {
  "0": 40, "1": 45, "2": 50, "3": 55, "4": 60, "5": 65, "6": 70,
};

export async function getDehumidifierStatus(auth: string, deviceId: string) {
  const commands = {
    CommandTypes: STATUS_COMMANDS.map((c) => ({ CommandType: c })),
    DeviceID: 1,
  };

  const data = await apiRequest("POST", "/DeviceGetInfo", {
    headers: { auth, gwid: deviceId },
    body: [commands],
  });

  if (!data) return {};

  const status: Record<string, unknown> = {};

  try {
    const devices = data.devices as Array<{ Info: Array<{ CommandType: string; status: string }> }>;
    const info = devices?.[0]?.Info ?? [];

    for (const item of info) {
      const ct = item.CommandType;
      const val = item.status;

      if (ct === "0x00") {
        status.power = val === "1";
      }
      if (ct === "0x01") {
        status.mode = MODE_DISPLAY[val] ?? "unknown";
      }
      if (ct === "0x04") {
        status.humidity = HUMIDITY_DISPLAY[val] ?? null;
      }
    }
  } catch (e) {
    console.error("Failed to parse dehumidifier status:", e);
  }

  return status;
}

export async function controlDehumidifier(
  auth: string,
  deviceId: string,
  opts: { power?: boolean; mode?: string; humidity?: number }
) {
  const results: string[] = [];
  const headers = { auth, gwid: deviceId };

  if (opts.power !== undefined) {
    await apiRequest("GET", "/DeviceSetCommand", {
      headers,
      params: { DeviceID: 1, CommandType: "0x00", Value: opts.power ? 1 : 0 },
    });
    results.push(`power: ${opts.power ? "on" : "off"}`);
  }

  if (opts.mode !== undefined) {
    const modeVal = MODE_MAP[opts.mode];
    if (modeVal !== undefined) {
      await apiRequest("GET", "/DeviceSetCommand", {
        headers,
        params: { DeviceID: 1, CommandType: "0x01", Value: modeVal },
      });
      results.push(`mode: ${opts.mode}`);
    }
  }

  if (opts.humidity !== undefined) {
    const humVal = HUMIDITY_MAP[opts.humidity];
    if (humVal !== undefined) {
      await apiRequest("GET", "/DeviceSetCommand", {
        headers,
        params: { DeviceID: 1, CommandType: "0x04", Value: humVal },
      });
      results.push(`humidity: ${opts.humidity}%`);
    }
  }

  return results;
}
