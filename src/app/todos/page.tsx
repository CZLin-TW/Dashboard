"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

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
  const { data: todos, loading, refetch: fetchTodos } = useCachedFetch<TodoItem[]>("/api/todos", []);
  const [filter, setFilter] = useState<FilterTab>("mine");
  const [showAdd, setShowAdd] = useState(false);
  const [newTodo, setNewTodo] = useState({ item: "", date: "", time: "", type: "私人" });
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editTodo, setEditTodo] = useState({ item: "", date: "", time: "", type: "私人" });

  const filteredTodos = todos.filter((t) => {
    if (t["狀態"] !== "待辦") return false;
    if (filter === "mine" && currentUser) {
      const name = currentUser.name;
      return t["負責人"] === name || t["負責人"] === name.substring(0, 2);
    }
    return true;
  });

  function addTodo() {
    if (!newTodo.item.trim() || !newTodo.date || !currentUser) return;
    fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: newTodo.item.trim(),
        date: newTodo.date,
        time: newTodo.time,
        person: currentUser.name,
        type: newTodo.type,
      }),
    }).then(() => {
      setNewTodo({ item: "", date: "", time: "", type: "私人" });
      setShowAdd(false);
      fetchTodos();
    });
  }

  function startEdit(todo: TodoItem, sheetIndex: number) {
    setEditIndex(sheetIndex);
    setEditTodo({
      item: todo["事項"],
      date: todo["日期"],
      time: todo["時間"],
      type: todo["類型"],
    });
  }

  function saveEdit() {
    if (editIndex === null || !currentUser) return;
    const original = todos[editIndex];
    fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: original["事項"],
        item_new: editTodo.item !== original["事項"] ? editTodo.item : undefined,
        date: editTodo.date !== original["日期"] ? editTodo.date : undefined,
        time: editTodo.time !== original["時間"] ? editTodo.time : undefined,
        type: editTodo.type !== original["類型"] ? editTodo.type : undefined,
        requester: currentUser.name,
      }),
    }).then(() => {
      setEditIndex(null);
      fetchTodos();
    });
  }

  function deleteTodo(item: string) {
    fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" }).then(() => fetchTodos());
  }

  function getSheetIndex(todo: TodoItem): number {
    return todos.indexOf(todo);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">☑️ 待辦清單</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + 新增
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button onClick={() => setFilter("mine")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${filter === "mine" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
          我的
        </button>
        <button onClick={() => setFilter("all")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
          全部
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <Card>
          <div className="space-y-3">
            <input
              type="text"
              value={newTodo.item}
              onChange={(e) => setNewTodo((p) => ({ ...p, item: e.target.value }))}
              placeholder="待辦事項內容"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400">日期 *</label>
                <input
                  type="date"
                  value={newTodo.date}
                  onChange={(e) => setNewTodo((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">時間（選填）</label>
                <input
                  type="time"
                  value={newTodo.time}
                  onChange={(e) => setNewTodo((p) => ({ ...p, time: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">類型</label>
                <select
                  value={newTodo.type}
                  onChange={(e) => setNewTodo((p) => ({ ...p, type: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="私人">私人</option>
                  <option value="公開">公開</option>
                </select>
              </div>
            </div>
            <button
              onClick={addTodo}
              disabled={!newTodo.item.trim() || !newTodo.date}
              className="w-full rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
            >
              確認新增
            </button>
          </div>
        </Card>
      )}

      {/* Todo List */}
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
          <p className="text-sm text-gray-500">沒有待辦事項</p>
        ) : (
          <ul className="space-y-1">
            {filteredTodos.map((todo) => {
              const isReadonly = todo["屬性"] === "唯讀";
              const sheetIndex = getSheetIndex(todo);
              const isEditing = editIndex === sheetIndex;

              if (isEditing) {
                return (
                  <li key={sheetIndex} className="rounded-lg bg-gray-800/50 px-3 py-3 space-y-2">
                    <input type="text" value={editTodo.item}
                      onChange={(e) => setEditTodo((p) => ({ ...p, item: e.target.value }))}
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
                    <div className="flex gap-2">
                      <input type="date" value={editTodo.date}
                        onChange={(e) => setEditTodo((p) => ({ ...p, date: e.target.value }))}
                        className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none" />
                      <input type="time" value={editTodo.time}
                        onChange={(e) => setEditTodo((p) => ({ ...p, time: e.target.value }))}
                        className="w-28 rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none" />
                      <select value={editTodo.type}
                        onChange={(e) => setEditTodo((p) => ({ ...p, type: e.target.value }))}
                        className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none">
                        <option value="私人">私人</option>
                        <option value="公開">公開</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit}
                        className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700">儲存</button>
                      <button onClick={() => setEditIndex(null)}
                        className="rounded-lg bg-gray-600 px-4 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-500">取消</button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={sheetIndex}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-800/50 transition-colors">
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
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(todo, sheetIndex)}
                        className="text-gray-500 hover:text-blue-400 transition-colors text-xs">✎</button>
                      <button onClick={() => deleteTodo(todo["事項"])}
                        className="text-gray-500 hover:text-red-400 transition-colors">✕</button>
                    </div>
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
