import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import { getDehumidifierStatus } from "@/lib/panasonic";

export async function GET() {
  try {
    const devices = await getSheetData("智能居家");
    const dehumidifier = devices.find(
      (d) => d["狀態"] === "啟用" && d["類型"] === "除濕機"
    );

    if (!dehumidifier) {
      return NextResponse.json({ error: "No dehumidifier found in sheet" });
    }

    const auth = dehumidifier["Auth"] ?? "";
    const deviceId = dehumidifier["Device ID"] ?? "";

    if (!auth || !deviceId) {
      return NextResponse.json({ error: "Missing auth or deviceId", auth: !!auth, deviceId: !!deviceId });
    }

    const status = await getDehumidifierStatus(auth, deviceId);
    return NextResponse.json({ ok: true, device: dehumidifier["名稱"], auth, deviceId, status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ ok: false, error: msg, stack }, { status: 500 });
  }
}
