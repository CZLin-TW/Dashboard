import crypto from "crypto";

const API_BASE = "https://api.switch-bot.com";
const TOKEN = process.env.SWITCHBOT_TOKEN ?? "";
const SECRET = process.env.SWITCHBOT_SECRET ?? "";

function makeHeaders() {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const stringToSign = `${TOKEN}${t}${nonce}`;
  const sign = crypto
    .createHmac("sha256", SECRET)
    .update(stringToSign)
    .digest("base64");

  return {
    Authorization: TOKEN,
    sign,
    nonce,
    t,
    "Content-Type": "application/json; charset=utf8",
  };
}

export async function getDevices() {
  const res = await fetch(`${API_BASE}/v1.1/devices`, {
    headers: makeHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json();
  if (data.statusCode !== 100) throw new Error(data.message);
  return data.body;
}

export async function getDeviceStatus(deviceId: string) {
  const res = await fetch(`${API_BASE}/v1.1/devices/${deviceId}/status`, {
    headers: makeHeaders(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json();
  if (data.statusCode !== 100) throw new Error(data.message);
  return data.body;
}

export async function sendDeviceCommand(
  deviceId: string,
  command: string,
  parameter: string = "default",
  commandType: string = "command"
) {
  const res = await fetch(`${API_BASE}/v1.1/devices/${deviceId}/commands`, {
    method: "POST",
    headers: makeHeaders(),
    body: JSON.stringify({ command, parameter, commandType }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json();
  if (data.statusCode !== 100) throw new Error(data.message);
  return data.body;
}

const AC_MODE_MAP: Record<string, number> = {
  auto: 1, cool: 2, dry: 3, fan: 4, heat: 5,
};

const AC_FAN_MAP: Record<string, number> = {
  auto: 1, low: 2, medium: 3, high: 4,
};

export async function controlAc(
  deviceId: string,
  opts: { power: boolean; temperature: number; mode: string; fanSpeed: string }
) {
  const modeNum = AC_MODE_MAP[opts.mode] ?? 1;
  const fanNum = AC_FAN_MAP[opts.fanSpeed] ?? 1;
  const powerStr = opts.power ? "on" : "off";
  const parameter = `${opts.temperature},${modeNum},${fanNum},${powerStr}`;
  return sendDeviceCommand(deviceId, "setAll", parameter);
}

export async function controlIr(deviceId: string, button: string) {
  const powerOnNames = new Set(["電源", "開", "開機", "power", "on", "turnon"]);
  const powerOffNames = new Set(["關", "關機", "off", "turnoff"]);
  const lowerButton = button.toLowerCase();

  if (powerOnNames.has(lowerButton)) {
    return sendDeviceCommand(deviceId, "turnOn");
  }
  if (powerOffNames.has(lowerButton)) {
    return sendDeviceCommand(deviceId, "turnOff");
  }
  return sendDeviceCommand(deviceId, button, "default", "customize");
}

export async function getSensorStatus(deviceId: string) {
  const status = await getDeviceStatus(deviceId);
  return {
    temperature: status.temperature,
    humidity: status.humidity,
  };
}
