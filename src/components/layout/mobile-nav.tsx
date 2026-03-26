"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

export function MobileNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden items-center justify-around border-t border-gray-800 bg-gray-900 px-2 py-2 safe-bottom">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
              isActive ? "text-blue-400" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
