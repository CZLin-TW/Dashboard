import { appStorage } from "./storage";

export const CACHE_SCHEMA = "2";
export interface QueryState { data: unknown; hasData: boolean; loading: boolean; error: string | null; updatedAt: number | null; isStale: boolean; }
const EMPTY: QueryState = { data: undefined, hasData: false, loading: false, error: null, updatedAt: null, isStale: false };
type Entry = { state: QueryState; listeners: Set<() => void>; generation: number; controller?: AbortController; pending?: Promise<void> };
const entries = new Map<string, Entry>();
const statusListeners = new Set<() => void>();
let statusVersion = 0;
let scope: string | null = null;
let staleTimer: ReturnType<typeof setInterval> | undefined;
function expireOldData() {
  for (const [key, entry] of entries) {
    const ageLimit = key.includes("/api/weather") ? 900_000 : /\/api\/devices(?:\/options)?$/.test(key) ? 1800_000 : 120_000;
    if (entry.listeners.size && entry.state.updatedAt && !entry.state.isStale && Date.now() - entry.state.updatedAt > ageLimit) {
      entry.state = { ...entry.state, isStale: true }; emit(entry);
    }
  }
}

function emit(entry: Entry) { entry.listeners.forEach(fn => fn()); statusVersion++; statusListeners.forEach(fn => fn()); }
export function queryKey(user: string, url: string) { return `cache:${CACHE_SCHEMA}:${encodeURIComponent(user)}:${url}`; }
function persistent(url: string) { return !/^\/api\/(todos|dashboard|recurring-todos)(?:[/?]|$)/.test(url); }
function entryFor(key: string, url: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    let state = EMPTY;
    if (typeof window !== "undefined" && persistent(url)) {
      try {
        const cached = JSON.parse(appStorage().getItem(key) || "null");
        if (cached && typeof cached.updatedAt === "number") state = { ...EMPTY, data: cached.data, hasData: true, isStale: true, updatedAt: cached.updatedAt };
      } catch { /* Invalid cache. */ }
    }
    entry = { state, listeners: new Set(), generation: 0 };
    entries.set(key, entry);
  }
  return entry;
}
export function clearQueryCache() {
  for (const entry of entries.values()) {
    entry.generation++; entry.controller?.abort(); entry.pending = undefined; entry.state = EMPTY; emit(entry);
  }
  entries.clear();
  if (typeof window !== "undefined") {
    try {
      for (const storage of [localStorage, sessionStorage]) {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key?.startsWith("cache:")) storage.removeItem(key);
        }
      }
    } catch { /* Storage can be disabled. */ }
  }
}
export function setQueryScope(user: string | null) {
  if (scope === user) return;
  if (scope || !user) clearQueryCache();
  else if (typeof window !== "undefined") {
    // Keep this user's schema-compatible cache across reloads; discard legacy/unscoped data.
    const prefix = `cache:${CACHE_SCHEMA}:${encodeURIComponent(user)}:`;
    try {
      for (const storage of [localStorage, sessionStorage]) {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key?.startsWith("cache:") && !key.startsWith(prefix)) storage.removeItem(key);
        }
      }
    } catch { /* Storage unavailable. */ }
  }
  scope = user;
}
export function querySnapshot(key: string, url: string) { return entryFor(key, url).state; }
export function subscribeQuery(key: string, url: string, listener: () => void) {
  const entry = entryFor(key, url); entry.listeners.add(listener);
  if (!staleTimer && typeof window !== "undefined") staleTimer = setInterval(expireOldData, 30_000);
  return () => {
    entry.listeners.delete(listener);
    if (![...entries.values()].some(e => e.listeners.size) && staleTimer) { clearInterval(staleTimer); staleTimer = undefined; }
    if (!entry.listeners.size && entry.pending) {
      entry.generation++; entry.controller?.abort(); entry.pending = undefined;
      entry.state = { ...entry.state, loading: false }; emit(entry);
    }
  };
}
export function refreshQuery(key: string, url: string, replace = false): Promise<void> {
  const entry = entryFor(key, url);
  if (entry.pending && !replace) return entry.pending;
  entry.controller?.abort();
  const generation = ++entry.generation;
  const controller = new AbortController(); entry.controller = controller;
  entry.state = { ...entry.state, loading: true }; emit(entry);
  const timeout = setTimeout(() => controller.abort(), 30_000);
  entry.pending = fetch(url, { signal: controller.signal })
    .then(async response => {
      if (entry.generation !== generation) return;
      if (response.status === 401 || (response.status === 403 && !persistent(url))) {
        entry.state = EMPTY;
        if (typeof window !== "undefined") window.dispatchEvent(new Event("session:expired"));
      }
      if (!response.ok) throw new Error(response.status === 401 ? "登入已失效，請重新登入。" : "暫時無法讀取，請稍後重試。");
      return response.json();
    })
    .then(data => {
      if (entry.generation !== generation) return;
      entry.state = { data, hasData: true, loading: false, error: null, updatedAt: Date.now(), isStale: false };
      if (persistent(url) && typeof window !== "undefined") {
        try { appStorage().setItem(key, JSON.stringify({ data, updatedAt: entry.state.updatedAt })); } catch { /* Full storage. */ }
      }
    })
    .catch(error => {
      if (entry.generation !== generation) return;
      entry.state = { ...entry.state, loading: false, error: controller.signal.aborted ? "讀取逾時，請稍後重試。" : error.message };
    })
    .finally(() => {
      clearTimeout(timeout);
      if (entry.generation !== generation) return;
      entry.pending = undefined; emit(entry);
    });
  return entry.pending;
}
export function subscribeQueryStatus(listener: () => void) { statusListeners.add(listener); return () => { statusListeners.delete(listener); }; }
export function queryStatusVersion() { return statusVersion; }
export function queryProblems() { return [...entries.values()].filter(e => e.listeners.size && (e.state.error || (e.state.isStale && !e.state.loading))).map(e => e.state); }
export function retryQueryProblems() {
  for (const [key, entry] of entries) if (entry.listeners.size && (entry.state.error || entry.state.isStale) && !entry.pending) void refreshQuery(key, key.slice(key.indexOf("/api/")));
}
