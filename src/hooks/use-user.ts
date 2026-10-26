"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { clearQueryCache, queryKey, querySnapshot, refreshQuery, setQueryScope } from "@/lib/query-store";

export interface SessionUser {
  lineUserId: string;
  name: string;
  picture?: string;
  role?: string;
}

interface SessionState {
  currentUser: SessionUser | null;
  isLoaded: boolean;
}

// ── 模組層共享 store ───────────────────────────────────────────────────────
// 為什麼不是每個 hook 各自 fetch：useUser 不只頁面在用，ScheduleSection 也用
// （只為了送出新增/編輯時填「負責人」），而 ScheduleSection 是**每張裝置卡各一份**。
// 各自 fetch 的話，裝置頁一掛載就同時發出 1（header UserSelector）+ N（裝置數）個
// 一模一樣的 /api/auth/me，在 hydration 當下跟真正要用的 /api/devices、
// /api/devices/status 搶伺服器 CPU 與連線（HTTP/1.1 下直接吃滿 6 連線上限）。
// 共享同一份結果 + 同一個 in-flight promise 之後，整頁只打一次。
//
// **成功**的結果快取到 process 結束是刻意的：登入/登出都會走 window.location 整頁重載，
// 模組狀態自然歸零。JWT 在頁面開著時過期只會讓 header 短暫顯示舊名字，實際權限由
// proxy.ts 擋（API 回 401、頁面導向 /login），不影響安全性。
//
// **失敗**則不快取：下一個掛載的元件會重試。這點必須保留——原本每個 hook 各自 fetch,
// 一次網路抖動只影響那一個元件；改成共享後若把失敗也快取起來，開頁瞬間抖一下就會讓
// currentUser 整頁永久是 null，而 ScheduleSection 的新增/編輯遇到 null 是**靜默 return**
// （`if (!currentUser) return;`）——按了沒反應也沒錯誤訊息，到重新整理為止。
//
// ⚠️ SSR 安全性：state 只會在 subscribe()（僅在 client 執行）之後被寫入，
// server 端永遠讀到 INITIAL。**絕對不要**改成在 module top-level 或 server 端
// 預先填值——那會讓同一個 Node process 把某個使用者的 session 洩漏給別人的 SSR。
const INITIAL: SessionState = { currentUser: null, isLoaded: false };

let state: SessionState = INITIAL;
let inflight: Promise<void> | null = null;
let failed = false;
let sessionGeneration = 0;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

function fetchSession(): Promise<void> {
  if (inflight) return inflight;
  const generation = sessionGeneration;
  inflight = fetch("/api/auth/me")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (generation !== sessionGeneration) return;
      failed = false;
      state = {
        currentUser: data && !data.error ? (data as SessionUser) : null,
        isLoaded: true,
      };
      setQueryScope(state.currentUser?.lineUserId || null);
    })
    // 網路錯誤也要把 isLoaded 設 true，否則整個 app 會卡在 loading 狀態；
    // 但標記 failed 讓下一個掛載的元件重試（見上方說明）。
    .catch(() => {
      if (generation !== sessionGeneration) return;
      failed = true;
      state = { currentUser: null, isLoaded: true };
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

// 開著不重新整理的頁面（例如當遙控器的平板）不會再載入一次，session 就不會被延長、
// 期限一到會在使用中被登出。所以定期再問一次 /api/auth/me：延長由那支路由決定，
// 這裡只在它明確回 401 時當成登出；網路錯誤或其他狀態一律不動畫面上的身分。
const KEEP_ALIVE_MS = 6 * 60 * 60 * 1000;
let lastKeepAlive = 0;
function keepSessionAlive(): void {
  if (!state.currentUser || Date.now() - lastKeepAlive < KEEP_ALIVE_MS) return;
  lastKeepAlive = Date.now();
  fetch("/api/auth/me")
    .then((res) => { if (res.status === 401) window.dispatchEvent(new Event("session:expired")); })
    .catch(() => { /* 下次再試 */ });
}

let listeningForLogout = false;
function subscribe(onStoreChange: () => void): () => void {
  if (!listeningForLogout && typeof window !== "undefined") {
    listeningForLogout = true;
    lastKeepAlive = Date.now();   // 載入時那次 fetchSession 已經算一次
    window.setInterval(keepSessionAlive, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) keepSessionAlive(); });
    window.addEventListener("session:expired", () => {
      sessionGeneration++;
      state = { currentUser: null, isLoaded: true };
      setQueryScope(null);
      emit();
    });
    window.addEventListener("storage", event => {
      if (event.key !== "session:logout") return;
      sessionGeneration++;
      state = { currentUser: null, isLoaded: true };
      setQueryScope(null);
      emit();
    });
  }
  subscribers.add(onStoreChange);
  // 第一個掛載的訂閱者負責觸發；之後掛載的直接共用結果或同一個 in-flight promise。
  // 上次失敗過就再試一次（成功的結果才是終局）。
  if (!state.isLoaded || failed) void fetchSession();
  return () => {
    subscribers.delete(onStoreChange);
  };
}

// snapshot 的物件 identity 只在資料真的變動時才換，useSyncExternalStore 才不會迴圈。
function getSnapshot(): SessionState {
  return state;
}

function getServerSnapshot(): SessionState {
  return INITIAL;
}

// ── 伺服器先給的身分（2026-10-26）───────────────────────────────────────────
// 版面在伺服器端本來就讀了 session；把結果（只有名稱類欄位）交給頁面，頁面就不必先等
// /api/auth/me 來回一趟才知道是誰、才拿得出快取、才開始抓資料（以前整頁都卡在這裡）。
// 這是每個請求自己的 props，不是 module 狀態，所以沒有上面 SSR 那段說的洩漏問題。
// /api/auth/me 照常在背景跑（延長 session、更新名稱）；它一回來就以它為準，包括「已登出」。
const SeededSession = createContext<SessionUser | null | undefined>(undefined);

export function SessionProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  useState(() => {
    // Client only, once: scope the device cache to this person before any page reads it.
    if (typeof window !== "undefined" && !state.isLoaded) setQueryScope(user?.lineUserId || null);
    return null;
  });
  usePrefetchMainPages(user);
  return createElement(SeededSession.Provider, { value: user }, children);
}

// The two pages used most (devices, to-dos) are read in the background shortly after any page opens,
// so moving to them shows fresh data instead of the device's last copy. Skipped when read in the last
// minute; a remote only ever sees the devices page.
const MAIN_PAGES = ["/api/hb/devices", "/api/hb/todos"];
const PREFETCH_DELAY_MS = 1500;
const FRESH_ENOUGH_MS = 60_000;
function usePrefetchMainPages(user: SessionUser | null) {
  const id = user?.lineUserId;
  const remote = user?.role === "remote";
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      for (const url of remote ? MAIN_PAGES.slice(0, 1) : MAIN_PAGES) {
        const key = queryKey(id, url);
        const last = querySnapshot(key).updatedAt;
        if (!last || Date.now() - last > FRESH_ENOUGH_MS) void refreshQuery(key, url);
      }
    }, PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [id, remote]);
}

export function useUser() {
  const live = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const seeded = useContext(SeededSession);
  const { currentUser, isLoaded } = live.isLoaded || seeded === undefined ? live : { currentUser: seeded, isLoaded: true };

  const logout = useCallback(async () => {
    sessionGeneration++;
    clearQueryCache();
    setQueryScope(null);
    state = { currentUser: null, isLoaded: true };
    emit();
    try { localStorage.setItem("session:logout", String(Date.now())); } catch { /* Storage disabled. */ }
    await fetch("/api/auth/logout", { method: "POST" });
    // 先清掉共享身分再導頁：萬一導頁被擋下來，畫面上不會還留著已登出的使用者。
    state = INITIAL;
    failed = false;
    emit();
    window.location.href = "/login";
  }, []);

  return { currentUser, isLoaded, logout };
}
