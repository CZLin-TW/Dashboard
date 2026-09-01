import { NextResponse } from "next/server";
import { butlerGet } from "@/lib/butler";

// 這支回的是純常數（home-butler `web_api.py:api_get_device_options` 只做 dict 轉換，
// 完全不碰 Sheet 也不碰雲端裝置）：空調模式/風速/溫度範圍、除濕機各品牌的模式與濕度
// 選項。值只有在 home-butler 部署新版本時才可能變。
//
// 但它每次頁面載入都被抓一次，而且要繞一整趟 Vercel Function → Render，跟真正在關鍵
// 路徑上的 /api/devices 搶時間。加上 s-maxage 之後 Vercel CDN 會直接在邊緣回應，
// 連 Function 都不會被叫起來。
//
// 快取共用是安全的：回應內容不含任何使用者相關資料，而 proxy.ts 在檔案系統路由（含
// 快取）之前就執行，未登入的請求仍然拿不到——CDN 只是省掉「已通過驗證的請求」那一趟。
//
// ⚠️ 只有成功回應才加快取標頭。把 500 快取起來會讓 home-butler 短暫抖動變成使用者
// 端持續一小時的壞掉，而這支的失敗本來完全無感（前端有 DEFAULT_OPTIONS 可退）。
const CACHE_HEADERS = {
  // 邊緣快取 1 小時；之後最多再用 1 小時的舊值並在背景更新（最差落後約 2 小時，
  // 對「只在部署時才變」的常數完全可接受）。max-age=0 讓瀏覽器仍向邊緣確認，
  // 免得改了選項要等使用者自己清快取。
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=3600",
};

export async function GET() {
  try {
    const data = await butlerGet("/api/devices/options");
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
