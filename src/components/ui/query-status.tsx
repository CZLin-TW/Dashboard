"use client";
import { useSyncExternalStore } from "react";
import { queryProblems, queryStatusVersion, retryQueryProblems, subscribeQueryStatus } from "@/lib/query-store";

export function QueryStatus() {
  useSyncExternalStore(subscribeQueryStatus, queryStatusVersion, () => 0);
  const problems = queryProblems();
  if (!problems.length) return null;
  const hasError = problems.some(p => p.error);
  const cached = problems.filter(p => p.hasData);
  const updatedAt = cached.map(p => p.updatedAt || 0).filter(Boolean).sort((a, b) => a - b)[0];
  return <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-amber-bg px-4 py-3 text-sm text-amber">
    <p className="flex-1">{!hasError ? "部分資料已有一段時間未更新。" : cached.length ? "部分資料更新失敗，目前顯示上次取得的內容。" : "部分資料尚未取得，請勿將空白視為沒有資料。"}
      {updatedAt ? ` 上次成功：${new Date(updatedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}。` : ""}</p>
    <button type="button" className="rounded-lg border border-current px-3 py-1 text-xs" onClick={retryQueryProblems}>重新讀取</button>
  </div>;
}
