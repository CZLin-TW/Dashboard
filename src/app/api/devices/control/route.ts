import { NextResponse } from "next/server";
import { butlerPost } from "@/lib/butler";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceName, action, params } = body;

    let result;
    if (action === "setAll") {
      result = await butlerPost("/api/devices/control/ac", {
        device_name: deviceName,
        power: params.power ? "on" : "off",
        temperature: params.temperature,
        mode: params.mode,
        fan_speed: params.fanSpeed,
      });
    } else if (action === "ir") {
      result = await butlerPost("/api/devices/control/ir", {
        device_name: deviceName,
        button: params.button,
      });
    } else if (action === "dehumidifier") {
      result = await butlerPost("/api/devices/control/dehumidifier", {
        device_name: deviceName,
        power: params.power !== undefined ? (params.power ? "on" : "off") : undefined,
        mode: params.mode,
        humidity: params.humidity,
      });
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
