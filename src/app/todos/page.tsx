"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";

interface TodoItem {
  "事項": string;
  "日期": string;
  "時間": string;
  "負責人": string;
  "狀態": string;
  "類型": string;
  "來源": string;
  "屬性": string;
}

type FilterTab = "mine" | "all";

export default function TodosPage() {
  const { currentUser } = useUser();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("mine");
  const [newItem, setNewItem] = useState("");

  const fetchTodos = useCallback(() => {
    fetch("/api/todos")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setTodos(data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const filteredTodos = todos.filter((t) => {
    if (t["狀態"] !== "待辦") return false;
    if (filter === "mine" && currentUser) {
      const name = currentUser.name;
      return t["負責人"] === name || t["負責人"] === name.substring(0, 2);
    }
    return true;
  });

  function addTodo() {
    if (!newItem.trim() || !currentUser) return;
    const today = new Date().toISOString().split("T")[0];
    fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: newItem.trim(),
        date: today,
        person: currentUser.name,
      }),
    }).then(() => {
      setNewItem("");
      fetchTodos();
    });
  }

  function deleteTodo(index: number) {
    fetch(`/api/todos?index=${index}`, { method: "DELETE" }).then(() => fetchTodos());
  }

  // Find the real sheet index for a filtered todo
  function getSheetIndex(todo: TodoItem): number {
    return todos.indexOf(todo);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">☑️ 待辦清單</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter("mine")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            filter === "mine" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          我的
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            filter === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          全部
        </button>
      </div>

      <Card>
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTodo()}
            placeholder="新增待辦事項..."
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={addTodo}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            新增
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "mine" ? `${currentUser?.name ?? ""} 的待辦` : "所有待辦"}
          </CardTitle>
          <span className="text-xs text-gray-500">{filteredTodos.length} 項</span>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : filteredTodos.length === 0 ? (
          <p className="text-sm text-gray-500">沒有待辦事項 🎉</p>
        ) : (
          <ul className="space-y-1">
            {filteredTodos.map((todo) => {
              const isReadonly = todo["屬性"] === "唯讀";
              const sheetIndex = getSheetIndex(todo);
              return (
                <li
                  key={sheetIndex}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-800/50 transition-colors"
                >
                  <span className="flex-shrink-0 text-lg text-gray-500">☐</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200">
                      {todo["事項"]}
                      {isReadonly && <span className="ml-2 text-xs text-gray-500">🔒</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {todo["日期"]}
                      {todo["時間"] && ` ${todo["時間"]}`}
                      {filter === "all" && ` · ${todo["負責人"]}`}
                      {todo["來源"] !== "本地" && ` · 來自 ${todo["來源"]}`}
                    </p>
                  </div>
                  <span className="rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                    {todo["類型"]}
                  </span>
                  {!isReadonly && (
                    <button
                      onClick={() => deleteTodo(sheetIndex)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
