"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { type TodoData } from "./types";

interface Props {
  todos: TodoData[];
  /** 標記完成成功後呼叫，由父層 refetch 資料；失敗時不會被呼叫。 */
  onCompleted: () => void;
}

/**
 * 首頁待辦卡：顯示父層篩好的「我的」待辦，每筆可勾選打勾。
 * 樂觀更新：點擊後立刻顯示完成動畫，背景送 DELETE。
 * 失敗時撤銷動畫 + alert 提示，避免使用者以為已經完成。
 */
export function TodoListCard({ todos, onCompleted }: Props) {
  const [completingItems, setCompletingItems] = useState<Set<string>>(new Set());

  function completeTodo(item: string) {
    setCompletingItems((prev) => new Set(prev).add(item));
    fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // 動畫秀完才 refetch，避免列表瞬間消失少了「畫個勾」的反饋
        setTimeout(() => {
          setCompletingItems((prev) => {
            const next = new Set(prev);
            next.delete(item);
            return next;
          });
          onCompleted();
        }, 500);
      })
      .catch((err) => {
        console.error(`[completeTodo] ${item} failed:`, err);
        // 撤銷樂觀更新，讓使用者重試
        setCompletingItems((prev) => {
          const next = new Set(prev);
          next.delete(item);
          return next;
        });
        alert(`完成失敗：${item}（${err instanceof Error ? err.message : "請稍後再試"}）`);
      });
  }

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
        <ul className="space-y-2">
          {todos.map((todo, i) => {
            const isCompleting = completingItems.has(todo["事項"]);
            return (
              <li
                key={i}
                className={`flex items-center gap-3 text-sm transition-all duration-500 ${
                  isCompleting ? "opacity-40 line-through scale-95" : ""
                }`}
              >
                <button
                  onClick={() => !isCompleting && completeTodo(todo["事項"])}
                  disabled={isCompleting}
                  className={`flex-shrink-0 w-4 h-4 rounded border-2 transition-colors ${
                    isCompleting
                      ? "border-fresh bg-fresh"
                      : "border-mute/50 hover:border-fresh hover:bg-fresh/20"
                  }`}
                  title="標記完成"
                >
                  {isCompleting && (
                    <svg
                      className="w-full h-full p-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="white"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
                <span className="text-soft">
                  {todo["事項"]}
                  {todo["時間"] && <span className="ml-1 text-mute">{todo["時間"]}</span>}
                </span>
                <span className="ml-auto text-xs text-mute">{todo["日期"]}</span>
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
