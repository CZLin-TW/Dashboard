"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useUser } from "./use-user";
import { queryKey, querySnapshot, refreshQuery, subscribeQuery, type QueryState } from "@/lib/query-store";

const EMPTY: QueryState = { data: undefined, hasData: false, loading: false, error: null, updatedAt: null, isStale: false };
const serverSnapshot = () => EMPTY;

/** User-scoped shared queries. Private life data is held in memory only. */
export function useCachedFetch<T>(url: string, fallback: T, enabled = true) {
  const { currentUser, isLoaded } = useUser();
  const active = enabled && !!currentUser;
  const key = queryKey(currentUser?.lineUserId || "", url);
  const subscribe = useCallback((listener: () => void) => active ? subscribeQuery(key, url, listener) : () => {}, [key, url, active]);
  const snapshot = useCallback(() => active ? querySnapshot(key, url) : EMPTY, [key, url, active]);
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => { if (active) void refreshQuery(key, url); }, [key, url, active]);
  const refetch = useCallback(() => active ? refreshQuery(key, url, true) : Promise.resolve(), [key, url, active]);
  return { data: state.hasData ? state.data as T : fallback, loading: enabled && (!isLoaded || state.loading || (active && !state.hasData && !state.error)),
    error: state.error, updatedAt: state.updatedAt, hasData: state.hasData,
    isStale: state.hasData && (!!state.error || state.isStale), refetch };
}
