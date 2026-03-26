import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import { getSensorStatus } from "@/lib/switchbot";
import { getDehumidifierStatus } from "@/lib/panasonic";

export async function GET() {
  try {
    const devices = await getSheetData("智能居家");
    const enabled = devices.filter((d) => d["狀態"] === "啟用");

    const result = [];
    for (const d of enabled) {
      const device: Record<string, unknown> = {
        name: d["名稱"],
        type: d["類型"],
        location: d["位置"] ?? "",
        deviceId: d["Device ID"],
        auth: d["Auth"] ?? "",
        buttons: d["按鈕"] ?? "",
      };

      if (d["類型"] === "感應器" && d["Device ID"]) {
        try {
          const status = await getSensorStatus(d["Device ID"]);
          device.temperature = status.temperature;
          device.humidity = status.humidity;
        } catch (e) {
          console.error(`Sensor ${d["名稱"]} error:`, e);
        }
      }

      if (d["類型"] === "除濕機" && d["Auth"] && d["Device ID"]) {
        try {
          const status = await getDehumidifierStatus(d["Auth"], d["Device ID"]);
          device.power = status.power;
          device.mode = status.mode;
          device.targetHumidity = status.humidity;
        } catch (e) {
          console.error(`Dehumidifier ${d["名稱"]} error:`, e);
        }
      }

      result.push(device);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
