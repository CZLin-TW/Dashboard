"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Fetch data with sessionStorage cache.
 * Shows cached data immediately, then updates with fresh data from API.
 */
export function useCachedFetch<T>(url: string, fallback: T) {
  const cacheKey = `cache:${url}`;
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Load cache after hydration to avoid SSR mismatch
  useEffect(() => {
    if (!hydrated) {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) setData(JSON.parse(cached));
      } catch { /* ignore */ }
      setHydrated(true);
    }
  }, [cacheKey, hydrated]);

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
