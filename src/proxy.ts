import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/debug", "/api/version", "/manifest.webmanifest", "/icons"];

// 兒童遙控器（role==="kid"）只准用裝置頁 + 它實際 fetch 的這些 API；其餘一律擋。
// 預設拒絕（allowlist），不是黑名單——新功能不會無意間對兒童開放。
// ⚠️ 維護點：這份清單 = /devices 子樹真正呼叫的端點集合。裝置頁日後新增資料來源／
// 控制端點時，要同步加進來，否則兒童頁那個區塊會壞掉（API 被 403）。
const KID_ALLOWED_PAGES = ["/devices"];
const KID_ALLOWED_APIS = [
  "/api/dashboard",            // 裝置清單 + options
  "/api/devices/status",       // 即時狀態輪詢
  "/api/devices/control",      // 控制指令（開關 / 冷氣 / 除濕機）
  "/api/ac/status",            // 冷氣歷史（sensor chart 背景色塊）
  "/api/sensors/status",       // 環境感測歷史
  "/api/dehumidifier/auto-rule",
  "/api/dehumidifier/history",
  "/api/schedules",            // 裝置排程
  "/api/computers/status",     // 電腦監控
  "/api/theater/summary",      // 劇院狀態
  "/api/theater/flags",        // 劇院開關
];

function kidPathAllowed(pathname: string): boolean {
  const ok = (p: string) => pathname === p || pathname.startsWith(p + "/");
  return KID_ALLOWED_PAGES.some(ok) || KID_ALLOWED_APIS.some(ok);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // 真正驗簽 + 驗 exp（不再只看 cookie 是否存在）——否則隨便偽造一個非空 cookie
  // 就能過閘、進到所有帶 server API key proxy 到後端的 data/control route。
  const user = await verifyToken(request.cookies.get("dashboard_session")?.value);
  if (!user) {
    // API 路由回 401 JSON（不要把 fetch 307 導到 login HTML）；頁面導向 login。
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
  }

  // 兒童遙控器：server 端強制只能用裝置頁 + 其所需 API。這層是真正的權限閘門，
  // 前端藏導覽列只是化妝——Dashboard 是公開 URL，光藏 UI 擋不住直接打 API。
  if (user.role === "kid" && !kidPathAllowed(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/devices", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
