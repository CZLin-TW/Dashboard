"use client";

import { useUser, type FamilyMember } from "@/hooks/use-user";

export function UserSelector() {
  const { currentUser, members, selectUser } = useUser();

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 transition-colors">
        <span className="text-lg">{currentUser?.avatar ?? "👤"}</span>
        <span className="hidden sm:inline">{currentUser?.name ?? "選擇使用者"}</span>
        <svg className="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="absolute right-0 top-full mt-1 w-40 rounded-lg bg-gray-800 border border-gray-700 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        {members.map((member: FamilyMember) => (
          <button
            key={member.id}
            onClick={() => selectUser(member)}
            className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg transition-colors ${
              currentUser?.id === member.id ? "text-blue-400" : "text-gray-200"
            }`}
          >
            <span>{member.avatar}</span>
            <span>{member.name}</span>
            {currentUser?.id === member.id && (
              <svg className="ml-auto h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
