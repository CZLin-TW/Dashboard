import type { Metadata } from "next";
import { Inter, Noto_Sans_TC } from "next/font/google";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileNav } from "@/components/layout/mobile-nav";
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
  description: "家庭智慧中控面板",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className={`h-full antialiased ${inter.variable} ${notoTC.variable}`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <DesktopNav />
        <MobileHeader />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 pb-24 md:pb-8">
          {children}
        </main>
        <MobileNav />
      </body>
    </html>
  );
}
