"use client";

import { useCallback, useState } from "react";

/**
 * 待辦「勾選完成」邏輯，首頁 TodoListCard 跟 todos page 共用。
 *
 * 流程：
 * 1. 樂觀加入 completing set → row 立刻顯示完成動畫（dim + line-through + 綠勾）
 * 2. fetch DELETE /api/todos
 * 3. 等動畫秀完（500ms）讓使用者看到「畫個勾」的反饋
 * 4. await onCompleted()（parent refetch），等 todos prop 真的不含此項
 * 5. 同一輪 React batch 清掉 completing entry → row 直接消失，沒有「動畫
 *    結束 → 項目還沒消失」的閃爍窗口
 *
 * 失敗時撤銷樂觀更新 + alert，讓使用者重試。
 *
 * 使用：
 *   const { completeTodo, isCompleting } = useCompleteTodo(refetch);
 *   <button onClick={() => completeTodo(item)}>...</button>
 *   row className 上加 isCompleting(item) 的動畫 class
 *
 * @param onCompleted parent refetch callback，建議回傳 Promise 才能等
 *   prop 真的更新後再清 completing；給 sync function 也能用（Promise.resolve
 *   包一層）。
 */
export function useCompleteTodo(onCompleted: () => void | Promise<void>) {
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  const completeTodo = useCallback(
    async (item: string) => {
      setCompleting((prev) => new Set(prev).add(item));
      try {
        const res = await fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 500));
        await Promise.resolve(onCompleted());
        setCompleting((prev) => {
          const next = new Set(prev);
          next.delete(item);
          return next;
        });
      } catch (err) {
        console.error(`[completeTodo] ${item} failed:`, err);
        setCompleting((prev) => {
          const next = new Set(prev);
          next.delete(item);
          return next;
        });
        alert(`完成失敗：${item}（${err instanceof Error ? err.message : "請稍後再試"}）`);
      }
    },
    [onCompleted],
  );

  const isCompleting = useCallback((item: string) => completing.has(item), [completing]);

  return { completeTodo, isCompleting };
}
