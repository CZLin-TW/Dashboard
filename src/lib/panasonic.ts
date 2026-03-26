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

async function refresh(): Promise<boolean> {
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

async function apiRequest(
  path: string,
  opts: { method?: string; body?: object; headers?: Record<string, string> } = {}
): Promise<Record<string, unknown>> {
  if (!cpToken) await login();

  const doRequest = async () => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "user-agent": "okhttp/4.9.1",
        cptoken: cpToken,
        ...opts.headers,
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    return res.json();
  };

  let data = await doRequest();

  if (data.StateMsg && typeof data.StateMsg === "string" &&
      (data.StateMsg.includes("RefreshToken") || data.StateMsg.includes("CPToken") || data.StateMsg.includes("逎時"))) {
    const refreshed = await refresh();
    if (!refreshed) await login();
    data = await doRequest();
  }

  return data;
}

const MODE_MAP: Record<string, number> = {
  continuous: 0, auto: 1, "anti-mildew": 2, fan: 3,
  target: 4, air_purify: 5, "ai-comfort": 6,
  eco: 7, quick: 8, silent: 9, clothes_dry: 10, mite_removal: 11,
};

const HUMIDITY_MAP: Record<number, number> = {
  40: 0, 45: 1, 50: 2, 55: 3, 60: 4, 65: 5, 70: 6,
};

export async function getDehumidifierStatus(auth: string, deviceId: string) {
  const data = await apiRequest("/DeviceGetInfo", {
    method: "POST",
    headers: { auth, gwid: deviceId },
    body: { DeviceID: 1, CommandType: [0, 1, 4] },
  });

  const commands = (data.CommandList ?? []) as Array<{ CommandType: string; Value: string }>;
  const status: Record<string, unknown> = {};

  for (const cmd of commands) {
    const type = parseInt(cmd.CommandType);
    const val = parseInt(cmd.Value);
    if (type === 0) status.power = val === 1;
    if (type === 1) {
      const modeNames = Object.entries(MODE_MAP);
      status.mode = modeNames.find(([, v]) => v === val)?.[0] ?? "unknown";
    }
    if (type === 4) {
      const humidityNames = Object.entries(HUMIDITY_MAP);
      const found = humidityNames.find(([, v]) => v === val);
      status.humidity = found ? parseInt(found[0]) : null;
    }
  }

  return status;
}

export async function controlDehumidifier(
  auth: string,
  deviceId: string,
  opts: { power?: boolean; mode?: string; humidity?: number }
) {
  const results: string[] = [];

  if (opts.power !== undefined) {
    await apiRequest(`/DeviceSetCommand?DeviceID=1&CommandType=0&Value=${opts.power ? 1 : 0}`, {
      headers: { auth, gwid: deviceId },
    });
    results.push(`power: ${opts.power ? "on" : "off"}`);
  }

  if (opts.mode !== undefined) {
    const modeVal = MODE_MAP[opts.mode];
    if (modeVal !== undefined) {
      await apiRequest(`/DeviceSetCommand?DeviceID=1&CommandType=1&Value=${modeVal}`, {
        headers: { auth, gwid: deviceId },
      });
      results.push(`mode: ${opts.mode}`);
    }
  }

  if (opts.humidity !== undefined) {
    const humVal = HUMIDITY_MAP[opts.humidity];
    if (humVal !== undefined) {
      await apiRequest(`/DeviceSetCommand?DeviceID=1&CommandType=4&Value=${humVal}`, {
        headers: { auth, gwid: deviceId },
      });
      results.push(`humidity: ${opts.humidity}%`);
    }
  }

  return results;
}
