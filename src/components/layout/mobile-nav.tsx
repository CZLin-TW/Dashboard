"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden items-center justify-around border-t border-line bg-surface/85 backdrop-blur-md px-2 py-2 safe-bottom">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-12 min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] transition-colors ${
              isActive ? "bg-cool-bg text-cool" : "text-mute hover:text-soft"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.6} />
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
