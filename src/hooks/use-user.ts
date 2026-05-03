"use client";

import { useState, useEffect, useCallback } from "react";

export interface SessionUser {
  lineUserId: string;
  name: string;
  picture?: string;
}

export function useUser() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) setCurrentUser(data);
        setIsLoaded(true);
      })
      // 網路錯誤也要把 isLoaded 設 true，否則整個 app 會卡在 loading 狀態。
      .catch(() => setIsLoaded(true));
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  return { currentUser, isLoaded, logout };
}
