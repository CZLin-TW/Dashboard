"use client";

import { useState } from "react";
import { CheckSquare, Plus, Lock, Pencil, X, Check } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  TabsPill,
  PillButton,
  IconActionButton,
} from "@/components/ui/device-controls";
import { todoUrgency, urgencyRowClass } from "@/lib/types";
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

// 不放 w-full 在 base，避免 flex item 被同時套 flex-1 + w-full 後在
// Chrome desktop 的 <input type="date"> 上被擠扁；單一 input 場合 caller
// 自己加 w-full（跟 food 頁同 pattern）。
const INPUT_BASE =
  "rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-cool focus:outline-none";

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

  async function completeTodo(item: string) {
    setCompletingItems((prev) => new Set(prev).add(item));
    try {
      const res = await fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, 500));
      // 等 refetch 真的回來、todos 已不含此項才清 completingItems，
      // 避免「動畫結束 → 項目還沒消失」的閃爍（同首頁 TodoListCard 邏輯）。
      await fetchTodos();
      setCompletingItems((prev) => {
        const next = new Set(prev);
        next.delete(item);
        return next;
      });
    } catch (err) {
      console.error(`[completeTodo] ${item} failed:`, err);
      setCompletingItems((prev) => {
        const next = new Set(prev);
        next.delete(item);
        return next;
      });
      alert(`完成失敗：${item}（${err instanceof Error ? err.message : "請稍後再試"}）`);
    }
  }

  function deleteTodo(item: string) {
    if (!confirm(`確定要刪除「${item}」嗎？`)) return;
    fetch(`/api/todos?item=${encodeURIComponent(item)}`, { method: "DELETE" }).then(() => fetchTodos());
  }

  function getSheetIndex(todo: TodoItem): number {
    return todos.indexOf(todo);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <CheckSquare className="h-5 w-5 text-mute" strokeWidth={2} />
          待辦清單
        </h1>
        <PillButton
          onClick={() => setShowAdd(!showAdd)}
          icon={<Plus className="h-4 w-4" strokeWidth={2.5} />}
        >
          新增
        </PillButton>
      </div>

      <TabsPill
        value={filter}
        onChange={setFilter}
        options={[
          { value: "mine", label: "我的" },
          { value: "all", label: "全部" },
        ]}
      />

      {showAdd && (
        <Card>
          <div className="space-y-3">
            <input
              type="text"
              value={newTodo.item}
              onChange={(e) => setNewTodo((p) => ({ ...p, item: e.target.value }))}
              placeholder="待辦事項內容"
              className={`w-full ${INPUT_BASE}`}
            />
            <Field label="日期 *">
              <input
                type="date"
                value={newTodo.date}
                onChange={(e) => setNewTodo((p) => ({ ...p, date: e.target.value }))}
                className={`w-full ${INPUT_BASE} appearance-none`}
              />
            </Field>
            <div>
              <label className="flex items-center gap-2 text-[12.5px] text-mute cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasTime}
                  onChange={() => {
                    setHasTime(!hasTime);
                    if (hasTime) setNewTodo((p) => ({ ...p, time: "" }));
                  }}
                  className="h-3.5 w-3.5 rounded border-line accent-cool"
                />
                指定時間
              </label>
              {hasTime && (
                <input
                  type="time"
                  value={newTodo.time}
                  onChange={(e) => setNewTodo((p) => ({ ...p, time: e.target.value }))}
                  className={`mt-2 w-full ${INPUT_BASE} appearance-none`}
                />
              )}
            </div>
            <Field label="類型">
              <select
                value={newTodo.type}
                onChange={(e) => setNewTodo((p) => ({ ...p, type: e.target.value }))}
                className={`field-select w-full ${INPUT_BASE}`}
              >
                <option value="私人">私人</option>
                <option value="公開">公開</option>
              </select>
            </Field>
            <button
              onClick={addTodo}
              disabled={!newTodo.item.trim() || !newTodo.date}
              className="w-full rounded-full bg-fresh px-5 py-2.5 text-sm font-semibold text-white hover:bg-fresh/85 disabled:bg-elevated disabled:text-mute transition-colors"
            >
              確認新增
            </button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "mine" ? `${currentUser?.name ?? ""} 的待辦` : "所有待辦"}
          </CardTitle>
          <span className="num text-xs text-mute">{filteredTodos.length} 項</span>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : filteredTodos.length === 0 ? (
          <p className="text-sm text-mute">沒有待辦事項</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {filteredTodos.map((todo) => {
              const isReadonly = todo["屬性"] === "唯讀";
              const sheetIndex = getSheetIndex(todo);
              const isEditing = editIndex === sheetIndex;

              if (isEditing) {
                return (
                  <li
                    key={sheetIndex}
                    className="rounded-[12px] bg-elevated/50 px-3 py-3 space-y-2.5"
                  >
                    <input
                      type="text"
                      value={editTodo.item}
                      onChange={(e) => setEditTodo((p) => ({ ...p, item: e.target.value }))}
                      className={`w-full ${INPUT_BASE}`}
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={editTodo.date}
                        onChange={(e) => setEditTodo((p) => ({ ...p, date: e.target.value }))}
                        className={`flex-1 min-w-0 ${INPUT_BASE}`}
                      />
                      <input
                        type="time"
                        value={editTodo.time}
                        onChange={(e) => setEditTodo((p) => ({ ...p, time: e.target.value }))}
                        className={`w-28 ${INPUT_BASE}`}
                      />
                      <select
                        value={editTodo.type}
                        onChange={(e) => setEditTodo((p) => ({ ...p, type: e.target.value }))}
                        className={`field-select w-24 ${INPUT_BASE}`}
                      >
                        <option value="私人">私人</option>
                        <option value="公開">公開</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        className="rounded-full bg-fresh px-4 py-1.5 text-xs font-semibold text-white hover:bg-fresh/85"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditIndex(null)}
                        className="rounded-full border border-line bg-elevated px-4 py-1.5 text-xs font-medium text-soft hover:bg-elevated/80"
                      >
                        取消
                      </button>
                    </div>
                  </li>
                );
              }

              const isCompleting = completingItems.has(todo["事項"]);
              const isPublic = todo["類型"] === "公開";
              const urgency = todoUrgency(todo["日期"], todo["時間"]);
              const urgencyCls = urgencyRowClass(urgency);
              // 已 highlight 的 row 不再加 hover bg（會 muddy 兩層底色）
              const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";

              return (
                <li
                  key={sheetIndex}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-all duration-500 ${urgencyCls} ${hoverCls} ${
                    isCompleting ? "opacity-40 line-through scale-95" : ""
                  }`}
                >
                  <button
                    onClick={() => !isCompleting && completeTodo(todo["事項"])}
                    disabled={isCompleting}
                    className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${
                      isCompleting
                        ? "border-fresh bg-fresh text-white"
                        : "border-line-strong bg-surface hover:border-fresh hover:bg-fresh/15"
                    }`}
                    title="標記完成"
                  >
                    {isCompleting && <Check className="h-3 w-3" strokeWidth={3} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1.5 text-sm text-foreground">
                      {todo["事項"]}
                      {isReadonly && <Lock className="h-3 w-3 text-faint" strokeWidth={2} />}
                    </p>
                    <p className="num text-xs text-mute">
                      {todo["日期"]}
                      {todo["時間"] && ` ${todo["時間"]}`}
                      {filter === "all" && ` · ${todo["負責人"]}`}
                      {todo["來源"] !== "本地" && ` · 來自 ${todo["來源"]}`}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
                      isPublic ? "bg-fresh-bg text-fresh" : "bg-cool-bg text-cool"
                    }`}
                  >
                    {todo["類型"]}
                  </span>
                  {!isReadonly && (
                    <div className="flex items-center gap-1">
                      <IconActionButton
                        onClick={() => startEdit(todo, sheetIndex)}
                        title="編輯"
                        icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2} />}
                      />
                      <IconActionButton
                        onClick={() => deleteTodo(todo["事項"])}
                        tone="danger"
                        title="刪除"
                        icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
                      />
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
