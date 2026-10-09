import { NextResponse } from "next/server";
import { requestUser, requestError, RequestError } from "@/lib/request-user";
import { zoneEditorConfig, zoneEditorEntry } from "@/lib/zone-editor";

// 一般成員才拿得到票（requestUser 擋未登入與 kid；proxy.ts 的 kid 白名單也沒有這條路徑）。
// 回應是導向，不是資料：瀏覽器直接被帶到家中主機的編輯工具。
export async function GET(request: Request) {
  try {
    await requestUser(request);
    const config = zoneEditorConfig();
    if (!config) throw new RequestError("尚未設定區域編輯。", 404);
    return new NextResponse(null, {
      status: 302,
      headers: { Location: await zoneEditorEntry(config, Date.now(), new URL(request.url).origin), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (err: unknown) {
    return requestError(err);
  }
}
