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
      .catch(() => setIsLoaded(false));
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  return { currentUser, isLoaded, logout };
}
