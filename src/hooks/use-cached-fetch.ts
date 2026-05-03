"use client";

// React 19 react-hooks/set-state-in-effect 規則對下列兩個 effect 都會 fire：
// (1) localStorage 還原 cache（必須等 client mount 才能讀，避免 SSR mismatch）
// (2) mount 時觸發 fetch
// 要乾淨改寫前者需要 useSyncExternalStore + snapshot identity 跟 cross-key
// cache map 的 boilerplate；後者要遷移到 Suspense + use()。對這個 codebase
// 不划算，整檔 disable 並在這裡集中說明 trade-off。
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from "react";

/**
 * Fetch data with localStorage cache (persists across tab closes).
 * Shows cached data immediately, then updates with fresh data from API.
 * Cache key is prefixed with APP_VERSION so a version bump auto-invalidates
 * all old cache entries — protecting users from schema-drift bugs after deploys.
 */
export function useCachedFetch<T>(url: string, fallback: T) {
  const cacheKey = `cache:${process.env.APP_VERSION}:${url}`;
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Load cache after hydration to avoid SSR mismatch
  useEffect(() => {
    if (!hydrated) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) setData(JSON.parse(cached));
      } catch { /* ignore */ }
      setHydrated(true);
    }
  }, [cacheKey, hydrated]);

  const refetch = useCallback((): Promise<void> => {
    setLoading(true);
    return fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((fresh) => {
        setData(fresh);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(fresh));
        } catch { /* storage full, ignore */ }
      })
      .catch((err) => {
        // Keep previous data and cache intact — never overwrite valid data with an error payload.
        console.error(`[useCachedFetch] ${url} failed:`, err);
      })
      .finally(() => setLoading(false));
  }, [url, cacheKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, refetch };
}
