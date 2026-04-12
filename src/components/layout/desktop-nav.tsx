"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { UserSelector } from "./user-selector";

export function DesktopNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 hidden md:flex items-center justify-between border-b border-gray-800 bg-gray-900 px-6 py-3">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-white">
          ⚡ Smart Home <span className="text-xs font-normal text-gray-500">v{process.env.APP_VERSION}</span>
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
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
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
