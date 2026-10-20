"use client";

import Link from "next/link";
import { CheckSquare, Check, Lightbulb } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { todoUrgency, urgencyRowClass, relativeDateLabel } from "@/lib/types";
import type { Todo } from "@/lib/api";
import { useCompleteTodo } from "@/hooks/use-complete-todo";

interface Props {
  statusText?: string;
  todos: Todo[];
  /** 標記完成成功後呼叫，由父層 refetch 資料；失敗時不會被呼叫。
   *  回傳 Promise 讓 useCompleteTodo 等 todos prop 真的更新後再清 completing
   *  → React 同一輪 batch render，避免「動畫結束 → 項目還沒消失」的閃爍。 */
  onCompleted: () => void | Promise<void>;
}

/**
 * 首頁待辦卡：顯示父層篩好的「我的」待辦，每筆可勾選打勾。
 * 完成邏輯（樂觀更新 + 動畫 + refetch 同步）由 useCompleteTodo hook 管。
 *
 * 視覺對齊 todos 頁的 list row（同尺寸 checkbox、同 .num 日期）。
 */
export function TodoListCard({ todos, onCompleted, statusText }: Props) {
  const { completeTodo, isCompleting } = useCompleteTodo(onCompleted);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <CheckSquare className="h-4 w-4" strokeWidth={2} />
          待辦事項
        </CardTitle>
        <Link href="/todos" className="text-sm text-cool hover:text-cool/80">
          查看全部 →
        </Link>
      </CardHeader>
      {statusText ? <p className="text-sm text-mute">{statusText}</p> : todos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => {
            const completing = isCompleting(todo);
            const lightNotify = todo.light_reminder;
            const urgency = todoUrgency(todo.due_date ?? "", todo.due_time ?? "");
            const urgencyCls = urgencyRowClass(urgency);
            const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";
            return (
              <li
                key={todo.id}
                className={`flex items-center gap-2 rounded-2xl px-2 py-2 transition-all duration-500 ${urgencyCls} ${hoverCls} ${
                  completing ? "opacity-40 line-through scale-95" : ""
                }`}
              >
                <button
                  onClick={() => !completing && completeTodo(todo)}
                  disabled={completing}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  title="標記完成"
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md border-[1.5px] transition-colors ${
                    completing
                      ? "border-fresh bg-fresh text-white"
                      : "border-line-strong bg-surface hover:border-fresh hover:bg-fresh/15"
                  }`}
                  >
                  {completing && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                  {todo.title}
                  {todo.due_time && <span className="num ml-1.5 text-xs text-mute">{todo.due_time}</span>}
                  {lightNotify && <Lightbulb className="ml-1.5 inline h-3 w-3 text-amber" strokeWidth={2} />}
                  </span>
                <span className="num mt-1 block text-[11px] leading-relaxed text-mute">
                  {todo.due_date}
                  {(() => {
                    const rel = relativeDateLabel(todo.due_date ?? "");
                    return rel ? ` (${rel})` : "";
                  })()}
                </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-mute">沒有待辦事項</p>
      )}
    </Card>
  );
}
