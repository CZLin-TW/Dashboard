import type { Metadata } from "next";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import "./globals.css";

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
    <html lang="zh-TW" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
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
