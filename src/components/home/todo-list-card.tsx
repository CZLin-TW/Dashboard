"use client";

import Link from "next/link";
import { CheckSquare, Check } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { type TodoData, todoUrgency, urgencyRowClass, relativeDateLabel } from "@/lib/types";
import { useCompleteTodo } from "@/hooks/use-complete-todo";

interface Props {
  todos: TodoData[];
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
export function TodoListCard({ todos, onCompleted }: Props) {
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
      {todos.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {todos.map((todo, i) => {
            const completing = isCompleting(todo["事項"]);
            const urgency = todoUrgency(todo["日期"], todo["時間"]);
            const urgencyCls = urgencyRowClass(urgency);
            const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";
            return (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-[12px] px-2 py-1.5 transition-all duration-500 ${urgencyCls} ${hoverCls} ${
                  completing ? "opacity-40 line-through scale-95" : ""
                }`}
              >
                <button
                  onClick={() => !completing && completeTodo(todo["事項"])}
                  disabled={completing}
                  className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
                    completing
                      ? "border-fresh bg-fresh text-white"
                      : "border-line-strong bg-surface hover:border-fresh hover:bg-fresh/15"
                  }`}
                  title="標記完成"
                >
                  {completing && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
                <span className="flex-1 truncate text-sm text-foreground">
                  {todo["事項"]}
                  {todo["時間"] && <span className="num ml-1.5 text-xs text-mute">{todo["時間"]}</span>}
                </span>
                <span className="num flex-shrink-0 text-xs text-mute">
                  {todo["日期"]}
                  {(() => {
                    const rel = relativeDateLabel(todo["日期"]);
                    return rel ? ` (${rel})` : "";
                  })()}
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
