import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_TC } from "next/font/google";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getSession } from "@/lib/auth";
import "./globals.css";

// Inter 給數字（用 .num class 觸發），Noto Sans TC 給內文。
// 透過 CSS variable 帶進去，讓 globals.css 的 --font-sans / --font-num 拿到實際字型。
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const notoTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-tc",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Smart Home Dashboard",
  applicationName: "Smart Home",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Smart Home",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  description: "家庭智慧中控面板",
};

export const viewport: Viewport = {
  themeColor: "#F2F2F4",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 兒童遙控器：藏掉所有導覽（去其他頁的入口）。純化妝——真正的閘門在 proxy.ts，
  // 即使這裡誤渲染，middleware 仍會把兒童擋在裝置頁外。
  const session = await getSession();
  const isKid = session?.role === "kid";

  return (
    <html lang="zh-TW" className={`h-full antialiased ${inter.variable} ${notoTC.variable}`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {!isKid && <DesktopNav />}
        {!isKid && <MobileHeader />}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8">
          {children}
        </main>
        {!isKid && <MobileNav />}
      </body>
    </html>
  );
}
