"use client";

import { useUser } from "@/hooks/use-user";

export function UserSelector() {
  const { currentUser, isLoaded, logout } = useUser();

  if (!isLoaded || !currentUser) return null;

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 transition-colors">
        {currentUser.picture ? (
          <img src={currentUser.picture} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <span className="text-lg">👤</span>
        )}
        <span className="hidden sm:inline">{currentUser.name}</span>
        <svg className="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="absolute right-0 top-full mt-1 w-40 rounded-lg bg-gray-800 border border-gray-700 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <div className="px-4 py-2.5 text-sm text-gray-300 border-b border-gray-700">
          {currentUser.name}
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-white/10 rounded-b-lg transition-colors"
        >
          登出
        </button>
      </div>
    </div>
  );
}
