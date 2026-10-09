import { NextResponse } from "next/server";
import { requestUser, requestError } from "@/lib/request-user";
import { butlerGet } from "@/lib/butler";
import { zoneEditorConfig } from "@/lib/zone-editor";

export async function GET(request: Request) {
  try {
    await requestUser(request);
    const data = await butlerGet("/api/home-assistant/observations");
    // 區域編輯入口有沒有設定好，順便告訴面板要不要顯示按鈕；只是一個是／否。
    const body = data && typeof data === "object" && !Array.isArray(data) ? { ...data, zone_editor: !!zoneEditorConfig() } : data;
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    return requestError(err);
  }
}
