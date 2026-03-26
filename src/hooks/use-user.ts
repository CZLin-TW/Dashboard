"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "dashboard-current-user";

export interface FamilyMember {
  id: string;
  name: string;
  avatar: string;
}

// This will eventually come from Google Sheets API
// For now, hardcoded as placeholder
export const FAMILY_MEMBERS: FamilyMember[] = [
  { id: "member-1", name: "使用者 1", avatar: "👤" },
  { id: "member-2", name: "使用者 2", avatar: "👤" },
];

export function useUser() {
  const [currentUser, setCurrentUser] = useState<FamilyMember | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setCurrentUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoaded(true);
  }, []);

  const selectUser = useCallback((member: FamilyMember) => {
    setCurrentUser(member);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(member));
  }, []);

  const clearUser = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { currentUser, isLoaded, selectUser, clearUser, members: FAMILY_MEMBERS };
}
