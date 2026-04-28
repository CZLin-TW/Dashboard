"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { UserSelector } from "./user-selector";

export function DesktopNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 hidden md:flex items-center justify-between border-b border-mute/15 bg-surface/80 backdrop-blur-md px-6 py-3">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-soft">
          ⚡ Smart Home <span className="text-xs font-normal text-mute">v{process.env.APP_VERSION}</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-cool/30 text-soft"
                    : "text-mute hover:bg-white/5 hover:text-soft"
                }`}
              >
                <span className="mr-1.5">{item.icon}</span>
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
