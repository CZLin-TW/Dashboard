"use client";

import { useState } from "react";
import { CheckSquare, Plus, Lock, Pencil, X, Check } from "lucide-react";
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
  const [hasTime, setHasTime] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editTodo, setEditTodo] = useState({ item: "", date: "", time: "", type: "私人" });
  const [completingItems, setCompletingItems] = useState<Set<string>>(new Set());

  const filteredTodos = todos.filter((t) => {
    if (t["狀態"] !== "待辦") return false;
    if (filter === "mine" && currentUser) {
      const name = currentUser.name;
      return t["負責人"] === name || t["負責人"] === name.substring(0, 2);
    }
    return true;
  }).sort((a, b) => {
    const dateA = `${a["日期"]} ${a["時間"] || "99:99"}`;
    const dateB = `${b["日期"]} ${b["時間"] || "99:99"}`;
    return dateA.localeCompare(dateB);
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
      setHasTime(false);
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

  function completeTodo(item: string) {
    setCompletingItems(prev => new Set(prev).add(item));
    fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" }).then(() => {
      setTimeout(() => {
        setCompletingItems(prev => { const next = new Set(prev); next.delete(item); return next; });
        fetchTodos();
      }, 500);
    });
  }

  function deleteTodo(item: string) {
    if (!confirm(`確定要刪除「${item}」嗎？`)) return;
    fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" }).then(() => fetchTodos());
  }

  function getSheetIndex(todo: TodoItem): number {
    return todos.indexOf(todo);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <CheckSquare className="h-6 w-6" strokeWidth={2} />
          待辦清單
        </h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 rounded-lg bg-cool px-4 py-2 text-sm font-medium text-white hover:bg-cool/85 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          新增
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button onClick={() => setFilter("mine")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${filter === "mine" ? "bg-cool text-white" : "bg-elevated text-soft hover:bg-elevated/80"}`}>
          我的
        </button>
        <button onClick={() => setFilter("all")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${filter === "all" ? "bg-cool text-white" : "bg-elevated text-soft hover:bg-elevated/80"}`}>
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
              className="w-full rounded-lg border border-mute/15 bg-elevated px-4 py-2.5 text-sm text-white placeholder-mute focus:border-cool focus:outline-none"
            />
            <div>
              <label className="text-xs text-mute">日期 *</label>
              <input
                type="date"
                value={newTodo.date}
                onChange={(e) => setNewTodo((p) => ({ ...p, date: e.target.value }))}
                className="mt-1 w-full max-w-full rounded-lg border border-mute/15 bg-elevated px-4 py-2.5 text-sm text-white focus:border-cool focus:outline-none appearance-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs text-mute cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasTime}
                  onChange={() => {
                    setHasTime(!hasTime);
                    if (hasTime) setNewTodo((p) => ({ ...p, time: "" }));
                  }}
                  className="rounded border-mute/15"
                />
                指定時間
              </label>
              {hasTime && (
                <input
                  type="time"
                  value={newTodo.time}
                  onChange={(e) => setNewTodo((p) => ({ ...p, time: e.target.value }))}
                  className="mt-1 w-full max-w-full rounded-lg border border-mute/15 bg-elevated px-4 py-2.5 text-sm text-white focus:border-cool focus:outline-none appearance-none"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-mute">類型</label>
              <select
                value={newTodo.type}
                onChange={(e) => setNewTodo((p) => ({ ...p, type: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-mute/15 bg-elevated px-4 py-2.5 text-sm text-white focus:border-cool focus:outline-none"
              >
                <option value="私人">私人</option>
                <option value="公開">公開</option>
              </select>
            </div>
            <button
              onClick={addTodo}
              disabled={!newTodo.item.trim() || !newTodo.date}
              className="w-full rounded-lg bg-fresh px-5 py-2.5 text-sm font-medium text-white hover:bg-fresh/85 disabled:bg-elevated disabled:text-mute transition-colors"
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
          <span className="text-xs text-mute">{filteredTodos.length} 項</span>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : filteredTodos.length === 0 ? (
          <p className="text-sm text-mute">沒有待辦事項</p>
        ) : (
          <ul className="space-y-1">
            {filteredTodos.map((todo) => {
              const isReadonly = todo["屬性"] === "唯讀";
              const sheetIndex = getSheetIndex(todo);
              const isEditing = editIndex === sheetIndex;

              if (isEditing) {
                return (
                  <li key={sheetIndex} className="rounded-lg bg-elevated/50 px-3 py-3 space-y-2">
                    <input type="text" value={editTodo.item}
                      onChange={(e) => setEditTodo((p) => ({ ...p, item: e.target.value }))}
                      className="w-full rounded-lg border border-mute/15 bg-elevated px-3 py-1.5 text-sm text-white focus:border-cool focus:outline-none" />
                    <div className="flex gap-2">
                      <input type="date" value={editTodo.date}
                        onChange={(e) => setEditTodo((p) => ({ ...p, date: e.target.value }))}
                        className="flex-1 rounded-lg border border-mute/15 bg-elevated px-3 py-1.5 text-sm text-white focus:outline-none" />
                      <input type="time" value={editTodo.time}
                        onChange={(e) => setEditTodo((p) => ({ ...p, time: e.target.value }))}
                        className="w-28 rounded-lg border border-mute/15 bg-elevated px-3 py-1.5 text-sm text-white focus:outline-none" />
                      <select value={editTodo.type}
                        onChange={(e) => setEditTodo((p) => ({ ...p, type: e.target.value }))}
                        className="rounded-lg border border-mute/15 bg-elevated px-3 py-1.5 text-sm text-white focus:outline-none">
                        <option value="私人">私人</option>
                        <option value="公開">公開</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit}
                        className="rounded-lg bg-fresh px-4 py-1.5 text-xs font-medium text-white hover:bg-fresh/85">儲存</button>
                      <button onClick={() => setEditIndex(null)}
                        className="rounded-lg bg-mute/40 px-4 py-1.5 text-xs font-medium text-soft hover:bg-mute/30">取消</button>
                    </div>
                  </li>
                );
              }

              const isCompleting = completingItems.has(todo["事項"]);

              return (
                <li key={sheetIndex}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-elevated/50 transition-all duration-500 ${isCompleting ? "opacity-40 line-through scale-95" : ""}`}>
                  <button
                    onClick={() => !isCompleting && completeTodo(todo["事項"])}
                    disabled={isCompleting}
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-colors ${isCompleting ? "border-fresh bg-fresh text-white" : "border-mute/30 hover:border-fresh hover:bg-fresh/20"}`}
                    title="標記完成"
                  >
                    {isCompleting && <Check className="w-full h-full p-0.5" strokeWidth={3} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-soft">
                      {todo["事項"]}
                      {isReadonly && <Lock className="ml-2 inline h-3 w-3 text-mute" strokeWidth={2} />}
                    </p>
                    <p className="text-xs text-mute">
                      {todo["日期"]}
                      {todo["時間"] && ` ${todo["時間"]}`}
                      {filter === "all" && ` · ${todo["負責人"]}`}
                      {todo["來源"] !== "本地" && ` · 來自 ${todo["來源"]}`}
                    </p>
                  </div>
                  <span className="rounded-md bg-elevated px-2 py-0.5 text-xs text-mute">
                    {todo["類型"]}
                  </span>
                  {!isReadonly && (
                    <div className="flex gap-3">
                      <button onClick={() => startEdit(todo, sheetIndex)}
                        className="rounded p-1.5 text-mute hover:text-cool hover:bg-cool/10 transition-colors"
                        title="編輯">
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button onClick={() => deleteTodo(todo["事項"])}
                        className="rounded p-1.5 text-mute hover:text-warm hover:bg-warm/10 transition-colors"
                        title="刪除">
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
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
