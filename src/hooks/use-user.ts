"use client";

import { useCallback, useSyncExternalStore } from "react";

export interface SessionUser {
  lineUserId: string;
  name: string;
  picture?: string;
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
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

function fetchSession(): Promise<void> {
  if (inflight) return inflight;
  inflight = fetch("/api/auth/me")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      failed = false;
      state = {
        currentUser: data && !data.error ? (data as SessionUser) : null,
        isLoaded: true,
      };
    })
    // 網路錯誤也要把 isLoaded 設 true，否則整個 app 會卡在 loading 狀態；
    // 但標記 failed 讓下一個掛載的元件重試（見上方說明）。
    .catch(() => {
      failed = true;
      state = { currentUser: null, isLoaded: true };
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

function subscribe(onStoreChange: () => void): () => void {
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

export function useUser() {
  const { currentUser, isLoaded } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // 先清掉共享身分再導頁：萬一導頁被擋下來，畫面上不會還留著已登出的使用者。
    state = INITIAL;
    failed = false;
    emit();
    window.location.href = "/login";
  }, []);

  return { currentUser, isLoaded, logout };
}
