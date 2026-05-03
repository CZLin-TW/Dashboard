"use client";

import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { UserSelector } from "./user-selector";

export function MobileHeader() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 flex md:hidden items-center justify-between border-b border-line bg-surface/85 backdrop-blur-md px-4 py-3">
      <span className="flex items-center gap-2 text-lg font-bold text-soft">
        <Zap className="h-5 w-5 text-fresh" strokeWidth={2} fill="currentColor" />
        Smart Home
        <span className="text-xs font-normal text-mute">v{process.env.APP_VERSION}</span>
      </span>
      <UserSelector />
    </header>
  );
}
