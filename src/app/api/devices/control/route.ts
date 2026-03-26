import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import { controlAc, controlIr } from "@/lib/switchbot";
import { controlDehumidifier } from "@/lib/panasonic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceName, action, params } = body;

    const devices = await getSheetData("智能居家");
    const device = devices.find((d) => d["狀態"] === "啟用" && d["名稱"] === deviceName);

    if (!device) {
      return NextResponse.json({ error: `找不到裝置: ${deviceName}` }, { status: 404 });
    }

    const deviceId = device["Device ID"];
    const deviceType = device["類型"];

    if (deviceType === "空調" && action === "setAll") {
      await controlAc(deviceId, params);
      return NextResponse.json({ ok: true });
    }

    if (deviceType === "IR" && action === "ir") {
      await controlIr(deviceId, params.button);
      return NextResponse.json({ ok: true });
    }

    if (deviceType === "除濕機") {
      const auth = device["Auth"] ?? "";
      await controlDehumidifier(auth, deviceId, params);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `不支援的操作: ${deviceType}/${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
