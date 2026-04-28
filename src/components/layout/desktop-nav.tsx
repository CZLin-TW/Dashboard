"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { UserSelector } from "./user-selector";

export function DesktopNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 hidden md:flex items-center justify-between border-b border-mute/15 bg-surface/80 backdrop-blur-md px-6 py-3">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-soft">
          <Zap className="h-5 w-5 text-fresh" strokeWidth={2} fill="currentColor" />
          Smart Home
          <span className="text-xs font-normal text-mute">v{process.env.APP_VERSION}</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-cool/15 text-cool"
                    : "text-mute hover:bg-mute/10 hover:text-soft"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <UserSelector />
    </header>
  );
}
