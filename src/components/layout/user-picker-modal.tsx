"use client";

import { useUser, type FamilyMember } from "@/hooks/use-user";

export function UserPickerModal() {
  const { currentUser, isLoaded, members, selectUser } = useUser();

  if (!isLoaded || currentUser) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏠</div>
          <h2 className="text-xl font-bold text-white">歡迎回家</h2>
          <p className="mt-2 text-sm text-gray-400">請選擇你的身份</p>
        </div>
        <div className="space-y-3">
          {members.map((member: FamilyMember) => (
            <button
              key={member.id}
              onClick={() => selectUser(member)}
              className="flex w-full items-center gap-4 rounded-xl bg-gray-800 px-5 py-4 text-left hover:bg-gray-700 transition-colors border border-gray-700 hover:border-gray-500"
            >
              <span className="text-2xl">{member.avatar}</span>
              <span className="text-base font-medium text-white">{member.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
