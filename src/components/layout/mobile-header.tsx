"use client";

import { usePathname } from "next/navigation";
import { UserSelector } from "./user-selector";

export function MobileHeader() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-40 flex md:hidden items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3">
      <span className="text-lg font-bold text-white">🏠 Smart Home</span>
      <UserSelector />
    </header>
  );
}
