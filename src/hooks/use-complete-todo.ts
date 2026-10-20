"use client";

import { useCallback, useState } from "react";
import { send } from "@/lib/api";

/**
 * 待辦「勾選完成」，首頁 TodoListCard 跟 todos page 共用。以待辦 id 定位，同名事項不會互相干擾。
 *
 * 1. 樂觀加入 completing set → row 立刻顯示完成動畫
 * 2. POST todos/{id}/complete
 * 3. 等動畫秀完（500ms），await onCompleted()（parent refetch）
 * 4. 同一輪清掉 completing → row 直接消失，沒有閃爍窗口
 *
 * 失敗時撤銷樂觀更新並顯示後端的原因。
 */
export function useCompleteTodo(onCompleted: () => void | Promise<void>) {
  const [completing, setCompleting] = useState<Set<number>>(new Set());

  const completeTodo = useCallback(async (todo: { id: number; title: string }) => {
    setCompleting((prev) => new Set(prev).add(todo.id));
    const done = () => setCompleting((prev) => { const next = new Set(prev); next.delete(todo.id); return next; });
    try {
      await send("POST", `todos/${todo.id}/complete`);
      await new Promise((r) => setTimeout(r, 500));
      await Promise.resolve(onCompleted());
      done();
    } catch (err) {
      done();
      alert(`完成失敗：${todo.title}（${err instanceof Error ? err.message : "請稍後再試"}）`);
    }
  }, [onCompleted]);

  const isCompleting = useCallback((todo: { id: number }) => completing.has(todo.id), [completing]);
  return { completeTodo, isCompleting };
}
