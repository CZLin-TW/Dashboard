"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";

interface TodoItem {
  id: string;
  item: string;
  date: string;
  time: string;
  person: string;
  type: string;
  source: string;
  done: boolean;
  readonly: boolean;
}

const mockTodos: TodoItem[] = [
  { id: "1", item: "繳電費", date: "2026-03-26", time: "", person: "使用者 1", type: "家務", source: "", done: false, readonly: false },
  { id: "2", item: "看牙醫", date: "2026-03-26", time: "14:00", person: "使用者 2", type: "個人", source: "", done: false, readonly: false },
  { id: "3", item: "倒垃圾", date: "2026-03-26", time: "21:00", person: "使用者 1", type: "家務", source: "", done: true, readonly: false },
  { id: "4", item: "專案會議", date: "2026-03-27", time: "10:00", person: "使用者 1", type: "工作", source: "Notion", done: false, readonly: true },
  { id: "5", item: "買日用品", date: "2026-03-27", time: "", person: "使用者 2", type: "家務", source: "", done: false, readonly: false },
];

type FilterTab = "mine" | "all";

export default function TodosPage() {
  const { currentUser } = useUser();
  const [todos, setTodos] = useState(mockTodos);
  const [filter, setFilter] = useState<FilterTab>("mine");
  const [newItem, setNewItem] = useState("");

  const filteredTodos =
    filter === "mine" && currentUser
      ? todos.filter((t) => t.person === currentUser.name)
      : todos;

  function toggleTodo(id: string) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id && !t.readonly ? { ...t, done: !t.done } : t))
    );
  }

  function addTodo() {
    if (!newItem.trim() || !currentUser) return;
    const todo: TodoItem = {
      id: Date.now().toString(),
      item: newItem.trim(),
      date: new Date().toISOString().split("T")[0],
      time: "",
      person: currentUser.name,
      type: "其他",
      source: "",
      done: false,
      readonly: false,
    };
    setTodos((prev) => [...prev, todo]);
    setNewItem("");
  }

  function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">☑️ 待辦清單</h1>

      {/* Filter Tabs */}
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

      {/* Add Todo */}
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

      {/* Todo List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "mine" ? `${currentUser?.name ?? ""} 的待辦` : "所有待辦"}
          </CardTitle>
          <span className="text-xs text-gray-500">{filteredTodos.length} 項</span>
        </CardHeader>
        {filteredTodos.length === 0 ? (
          <p className="text-sm text-gray-500">沒有待辦事項 🎉</p>
        ) : (
          <ul className="space-y-1">
            {filteredTodos.map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-800/50 transition-colors"
              >
                <button
                  onClick={() => toggleTodo(todo.id)}
                  disabled={todo.readonly}
                  className={`flex-shrink-0 text-lg ${
                    todo.readonly ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  }`}
                >
                  {todo.done ? "☑" : "☐"}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${todo.done ? "text-gray-500 line-through" : "text-gray-200"}`}>
                    {todo.item}
                    {todo.readonly && <span className="ml-2 text-xs text-gray-500">🔒</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {todo.date}
                    {todo.time && ` ${todo.time}`}
                    {filter === "all" && ` · ${todo.person}`}
                    {todo.source && ` · 來自 ${todo.source}`}
                  </p>
                </div>
                <span className="rounded-md bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                  {todo.type}
                </span>
                {!todo.readonly && (
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
