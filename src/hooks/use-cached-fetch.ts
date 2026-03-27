"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Fetch data with sessionStorage cache.
 * Shows cached data immediately, then updates with fresh data from API.
 */
export function useCachedFetch<T>(url: string, fallback: T) {
  const cacheKey = `cache:${url}`;
  const [data, setData] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : fallback;
    } catch {
      return fallback;
    }
  });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((fresh) => {
        setData(fresh);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(fresh));
        } catch { /* storage full, ignore */ }
      })
      .finally(() => setLoading(false));
  }, [url, cacheKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}
