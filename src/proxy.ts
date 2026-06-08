import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/debug", "/api/version", "/manifest.webmanifest", "/icons"];

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
