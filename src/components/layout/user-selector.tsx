"use client";

import { ChevronDown, User, LogOut } from "lucide-react";
import { useUser } from "@/hooks/use-user";

export function UserSelector() {
  const { currentUser, isLoaded, logout } = useUser();

  if (!isLoaded || !currentUser) return null;

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-elevated transition-colors">
        {currentUser.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUser.picture} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <User className="h-5 w-5 text-mute" strokeWidth={2} />
        )}
        <span className="hidden sm:inline">{currentUser.name}</span>
        <ChevronDown className="h-4 w-4 opacity-60" strokeWidth={2} />
      </button>
      <div className="absolute right-0 top-full mt-1 w-40 rounded-[14px] bg-surface border border-line shadow-lg shadow-mute/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
        <div className="px-4 py-2.5 text-sm text-soft border-b border-line">
          {currentUser.name}
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-warm hover:bg-warm-bg transition-colors"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          登出
        </button>
      </div>
    </div>
  );
}
