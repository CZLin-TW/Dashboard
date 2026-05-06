"use client";

import { useCallback, useState } from "react";

/** 用 (事項, 日期, 時間) 三元組唯一識別一筆待辦——避免同名不同時間的兩筆
 *  在 completing set / DELETE API 上互相干擾（會誤標另一筆完成）。 */
export interface CompletableTodo {
  "事項": string;
  "日期": string;
  "時間": string;
}

function todoKey(t: CompletableTodo): string {
  return `${t["事項"]}${t["日期"]}${t["時間"] ?? ""}`;
}

/**
 * 待辦「勾選完成」邏輯，首頁 TodoListCard 跟 todos page 共用。
 *
 * 流程：
 * 1. 樂觀加入 completing set → row 立刻顯示完成動畫（dim + line-through + 綠勾）
 * 2. fetch DELETE /api/todos（帶 item + date_orig + time_orig 三元組定位）
 * 3. 等動畫秀完（500ms）讓使用者看到「畫個勾」的反饋
 * 4. await onCompleted()（parent refetch），等 todos prop 真的不含此項
 * 5. 同一輪 React batch 清掉 completing entry → row 直接消失，沒有「動畫
 *    結束 → 項目還沒消失」的閃爍窗口
 *
 * 失敗時撤銷樂觀更新 + alert，讓使用者重試。
 */
export function useCompleteTodo(onCompleted: () => void | Promise<void>) {
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  const completeTodo = useCallback(
    async (todo: CompletableTodo) => {
      const k = todoKey(todo);
      setCompleting((prev) => new Set(prev).add(k));
      try {
        const params = new URLSearchParams({
          item: todo["事項"],
          date_orig: todo["日期"] || "",
          time_orig: todo["時間"] || "",
        });
        const res = await fetch(`/api/todos?${params}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 500));
        await Promise.resolve(onCompleted());
        setCompleting((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      } catch (err) {
        console.error(`[completeTodo] ${todo["事項"]} failed:`, err);
        setCompleting((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
        alert(`完成失敗：${todo["事項"]}（${err instanceof Error ? err.message : "請稍後再試"}）`);
      }
    },
    [onCompleted],
  );

  const isCompleting = useCallback(
    (todo: CompletableTodo) => completing.has(todoKey(todo)),
    [completing],
  );

  return { completeTodo, isCompleting };
}
