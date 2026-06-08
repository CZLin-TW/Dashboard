"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Plus, Lock, Pencil, X, Check, Lightbulb, Repeat } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  PillButton,
  IconActionButton,
  Dropdown,
  Stepper,
} from "@/components/ui/device-controls";
import {
  todoLightNotify, todoUrgency, urgencyRowClass, relativeDateLabel,
  isRecurringInstance, type RecurringRule,
} from "@/lib/types";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useCompleteTodo } from "@/hooks/use-complete-todo";

interface TodoItem {
  "事項": string;
  "日期": string;
  "時間": string;
  "負責人": string;
  "狀態": string;
  "類型": string;
  "來源": string;
  "屬性": string;
  "燈光提醒"?: string | boolean;
  "燈光區域ID"?: string;
  "規則ID"?: string;
}

// 週期任務的頻率選項 + 星期 + 月日。
const RECUR_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "每天", label: "每天" },
  { value: "每週", label: "每週" },
  { value: "每月", label: "每月" },
  { value: "間隔天", label: "間隔天" },
];
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "一" }, { value: 2, label: "二" }, { value: 3, label: "三" },
  { value: 4, label: "四" }, { value: 5, label: "五" }, { value: 6, label: "六" },
  { value: 7, label: "日" },
];
const MONTH_DAY_OPTIONS: { value: number; label: string }[] =
  Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1} 號` }));

interface RecurState {
  type: string;
  weekdays: number[];
  monthDay: number;
  interval: number;
  endDate: string;
}
const RECUR_DEFAULT: RecurState = { type: "每天", weekdays: [], monthDay: 1, interval: 3, endDate: "" };

interface LightingArea {
  id: string;
  resource_type: string;
  hue_name: string;
  display_name: string;
  enabled?: boolean;
}

interface LightingPayload {
  agent_id: string;
  areas: LightingArea[];
}

// 不放 w-full 在 base，避免 flex item 被同時套 flex-1 + w-full 後在
// Chrome desktop 的 <input type="date"> 上被擠扁；單一 input 場合 caller
// 自己加 w-full（跟 food 頁同 pattern）。
const INPUT_BASE =
  "rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-cool focus:outline-none";

export default function TodosPage() {
  const { currentUser } = useUser();
  const { data: todos, loading, refetch: fetchTodos } = useCachedFetch<TodoItem[]>("/api/todos", []);
  const { data: lightingPayload } = useCachedFetch<LightingPayload | null>("/api/lighting/areas", null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTodo, setNewTodo] = useState({ item: "", date: "", time: "", type: "私人", light_notify: false, light_area_id: "" });
  const [hasTime, setHasTime] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editTodo, setEditTodo] = useState({ item: "", date: "", time: "", type: "私人", light_notify: false, light_area_id: "" });
  const { completeTodo, isCompleting } = useCompleteTodo(fetchTodos);
  // 週期任務：新增表單的「重複」開關 + 規則，以及現有模板清單（管理 Card 用）。
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recur, setRecur] = useState<RecurState>(RECUR_DEFAULT);
  const { data: recurringRules, refetch: fetchRules } =
    useCachedFetch<RecurringRule[]>("/api/recurring-todos", []);
  const lightingAreas = useMemo(
    () => (lightingPayload?.areas ?? []).filter((area) => area.enabled !== false),
    [lightingPayload],
  );
  const defaultLightAreaId = useMemo(() => {
    const livingRoom = lightingAreas.find((area) => {
      const name = `${area.display_name || ""} ${area.hue_name || ""}`;
      return name.includes("客廳");
    });
    return livingRoom?.id ?? lightingAreas[0]?.id ?? "";
  }, [lightingAreas]);
  const lightingAreaNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const area of lightingAreas) {
      map[area.id] = area.display_name || area.hue_name || area.id;
    }
    return map;
  }, [lightingAreas]);

  // 隱私：移除「我的 / 全部」切換，永遠只顯示「自己負責 + 公開」項目；
  // 沒登入則完全不顯示（避免他人 device 看到任何個人待辦）。
  const myName = currentUser?.name ?? "";
  const myShortName = myName.substring(0, 2);
  function isMine(t: TodoItem): boolean {
    if (!currentUser) return false;
    return t["負責人"] === myName || t["負責人"] === myShortName;
  }
  function isPublic(t: TodoItem): boolean {
    return t["類型"] === "公開";
  }

  const filteredTodos = todos
    .filter((t) => t["狀態"] === "待辦" && (isMine(t) || isPublic(t)))
    .sort((a, b) => {
      const dateA = `${a["日期"]} ${a["時間"] || "99:99"}`;
      const dateB = `${b["日期"]} ${b["時間"] || "99:99"}`;
      return dateA.localeCompare(dateB);
    });

  // 每週至少選一天才有效；其他類型一律有效。
  const recurValid = recur.type !== "每週" || recur.weekdays.length > 0;

  function toggleWeekday(d: number) {
    setRecur((p) => ({
      ...p,
      weekdays: p.weekdays.includes(d)
        ? p.weekdays.filter((x) => x !== d)
        : [...p.weekdays, d].sort((a, b) => a - b),
    }));
  }

  function resetAddForm() {
    setNewTodo({ item: "", date: "", time: "", type: "私人", light_notify: false, light_area_id: "" });
    setHasTime(false);
    setRecurEnabled(false);
    setRecur(RECUR_DEFAULT);
    setShowAdd(false);
  }

  function addTodo() {
    if (!newTodo.item.trim() || !currentUser) return;
    if (recurEnabled) {
      addRecurring();
      return;
    }
    if (!newTodo.date) return;
    fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: newTodo.item.trim(),
        date: newTodo.date,
        time: newTodo.time,
        person: currentUser.name,
        type: newTodo.type,
        light_notify: hasTime && newTodo.light_notify,
        light_area_id: hasTime && newTodo.light_notify ? (newTodo.light_area_id || defaultLightAreaId) : undefined,
      }),
    }).then(() => {
      resetAddForm();
      fetchTodos();
    });
  }

  function addRecurring() {
    if (!currentUser || !recurValid) return;
    const useLight = hasTime && newTodo.light_notify;
    const body: Record<string, unknown> = {
      item: newTodo.item.trim(),
      recur_type: recur.type,
      person: currentUser.name,
      type: newTodo.type,
      time: hasTime ? newTodo.time : "",
      light_notify: useLight,
      light_area_id: useLight ? (newTodo.light_area_id || defaultLightAreaId) : undefined,
      end_date: recur.endDate || undefined,
    };
    if (recur.type === "每週") body.weekdays = recur.weekdays;
    if (recur.type === "每月") body.month_day = recur.monthDay;
    if (recur.type === "間隔天") body.interval_days = recur.interval;
    fetch("/api/recurring-todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error ?? "新增週期提醒失敗");
        return;
      }
      resetAddForm();
      fetchTodos();
      fetchRules();
    });
  }

  function stopRecurring(rule: RecurringRule) {
    const summary = rule["摘要"] ? `（${rule["摘要"]}）` : "";
    if (!confirm(`要永久停止整個週期提醒「${rule["事項"]}」${summary} 嗎？\n已經產生在清單上的當次待辦不會被移除。`)) return;
    const params = new URLSearchParams({ rule_id: rule["規則ID"] });
    fetch(`/api/recurring-todos?${params}`, { method: "DELETE" }).then(() => {
      fetchRules();
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
      light_notify: todoLightNotify(todo),
      light_area_id: todoLightNotify(todo) ? (todo["燈光區域ID"] || defaultLightAreaId) : "",
    });
  }

  function saveEdit() {
    if (editIndex === null || !currentUser) return;
    const original = todos[editIndex];
    const nextLightAreaId = editTodo.light_notify ? (editTodo.light_area_id || defaultLightAreaId) : "";
    fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item: original["事項"],
        date_orig: original["日期"],
        time_orig: original["時間"],
        item_new: editTodo.item !== original["事項"] ? editTodo.item : undefined,
        date: editTodo.date !== original["日期"] ? editTodo.date : undefined,
        time: editTodo.time !== original["時間"] ? editTodo.time : undefined,
        type: editTodo.type !== original["類型"] ? editTodo.type : undefined,
        light_notify: editTodo.light_notify !== todoLightNotify(original) ? editTodo.light_notify : undefined,
        light_area_id: nextLightAreaId !== (original["燈光區域ID"] || "") ? nextLightAreaId : undefined,
        requester: currentUser.name,
      }),
    }).then(() => {
      setEditIndex(null);
      fetchTodos();
    });
  }


  function deleteTodo(todo: TodoItem) {
    if (!confirm(`確定要刪除「${todo["事項"]}」嗎？`)) return;
    const params = new URLSearchParams({
      item: todo["事項"],
      date_orig: todo["日期"] || "",
      time_orig: todo["時間"] || "",
    });
    fetch(`/api/todos?${params}`, { method: "DELETE" }).then(() => fetchTodos());
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
            <label className="flex items-center gap-2 text-[12.5px] text-mute cursor-pointer select-none">
              <input
                type="checkbox"
                checked={recurEnabled}
                onChange={() => setRecurEnabled((v) => !v)}
                className="h-3.5 w-3.5 rounded border-line accent-cool"
              />
              <Repeat className="h-3.5 w-3.5" strokeWidth={2} />
              重複（週期任務）
            </label>

            {!recurEnabled ? (
              <Field label="日期 *">
                <input
                  type="date"
                  value={newTodo.date}
                  onChange={(e) => setNewTodo((p) => ({ ...p, date: e.target.value }))}
                  className={`w-full ${INPUT_BASE} appearance-none`}
                />
              </Field>
            ) : (
              <div className="space-y-3 rounded-[12px] bg-elevated/40 p-3">
                <Field label="頻率">
                  <Dropdown
                    options={RECUR_TYPE_OPTIONS}
                    value={recur.type}
                    onSelect={(v) => setRecur((p) => ({ ...p, type: v }))}
                    className="w-full"
                  />
                </Field>
                {recur.type === "每週" && (
                  <Field label="星期（可多選）">
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((d) => {
                        const active = recur.weekdays.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleWeekday(d.value)}
                            className={`grid h-8 w-8 place-items-center rounded-full text-[13px] font-medium transition-colors ${
                              active
                                ? "bg-cool text-white shadow-sm"
                                : "border border-line bg-surface text-soft hover:text-foreground"
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}
                {recur.type === "每月" && (
                  <Field label="每月幾號">
                    <Dropdown
                      options={MONTH_DAY_OPTIONS}
                      value={recur.monthDay}
                      onSelect={(v) => setRecur((p) => ({ ...p, monthDay: v }))}
                    />
                  </Field>
                )}
                {recur.type === "間隔天" && (
                  <Field label="每隔幾天">
                    <Stepper
                      value={recur.interval}
                      unit="天"
                      onMinus={() => setRecur((p) => ({ ...p, interval: Math.max(1, p.interval - 1) }))}
                      onPlus={() => setRecur((p) => ({ ...p, interval: p.interval + 1 }))}
                    />
                  </Field>
                )}
                <Field label="結束日期（選填）">
                  <input
                    type="date"
                    value={recur.endDate}
                    onChange={(e) => setRecur((p) => ({ ...p, endDate: e.target.value }))}
                    className={`w-full ${INPUT_BASE} appearance-none`}
                  />
                </Field>
                {recur.type === "每月" && (
                  <p className="text-[11px] text-faint">
                    每月 29~31 號遇到較短的月份（如 2 月）會自動落在當月最後一天。
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="flex items-center gap-2 text-[12.5px] text-mute cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasTime}
                  onChange={() => {
                    const next = !hasTime;
                    setHasTime(next);
                    if (!next) setNewTodo((p) => ({ ...p, time: "", light_notify: false, light_area_id: "" }));
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
            <label
              className={`flex items-center gap-2 text-[12.5px] select-none ${
                hasTime ? "cursor-pointer text-mute" : "cursor-not-allowed text-faint"
              }`}
            >
              <input
                type="checkbox"
                checked={newTodo.light_notify}
                disabled={!hasTime}
                onChange={(e) => setNewTodo((p) => ({
                  ...p,
                  light_notify: e.target.checked,
                  light_area_id: e.target.checked ? (p.light_area_id || defaultLightAreaId) : "",
                }))}
                className="h-3.5 w-3.5 rounded border-line accent-cool disabled:opacity-40"
              />
              <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
              燈光提醒
            </label>
            {hasTime && newTodo.light_notify && (
              <Field label="提醒區域">
                <select
                  value={newTodo.light_area_id || defaultLightAreaId}
                  onChange={(e) => setNewTodo((p) => ({ ...p, light_area_id: e.target.value }))}
                  disabled={lightingAreas.length === 0}
                  className={`field-select w-full ${INPUT_BASE}`}
                >
                  {lightingAreas.length === 0 ? (
                    <option value="">尚未取得照明區域</option>
                  ) : lightingAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.display_name || area.hue_name || area.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
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
              disabled={!newTodo.item.trim() || (recurEnabled ? !recurValid : !newTodo.date)}
              className="w-full rounded-full bg-fresh px-5 py-2.5 text-sm font-semibold text-white hover:bg-fresh/85 disabled:bg-elevated disabled:text-mute transition-colors"
            >
              {recurEnabled ? "確認新增週期提醒" : "確認新增"}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>待辦事項</CardTitle>
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
                        onChange={(e) => setEditTodo((p) => ({
                          ...p,
                          time: e.target.value,
                          light_notify: e.target.value ? p.light_notify : false,
                          light_area_id: e.target.value ? p.light_area_id : "",
                        }))}
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
                    <label
                      className={`flex items-center gap-2 text-[12.5px] select-none ${
                        editTodo.time ? "cursor-pointer text-mute" : "cursor-not-allowed text-faint"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={editTodo.light_notify}
                        disabled={!editTodo.time}
                        onChange={(e) => setEditTodo((p) => ({
                          ...p,
                          light_notify: e.target.checked,
                          light_area_id: e.target.checked ? (p.light_area_id || defaultLightAreaId) : "",
                        }))}
                        className="h-3.5 w-3.5 rounded border-line accent-cool disabled:opacity-40"
                      />
                      <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
                      燈光提醒
                    </label>
                    {editTodo.time && editTodo.light_notify && (
                      <Field label="提醒區域">
                        <select
                          value={editTodo.light_area_id || defaultLightAreaId}
                          onChange={(e) => setEditTodo((p) => ({ ...p, light_area_id: e.target.value }))}
                          disabled={lightingAreas.length === 0}
                          className={`field-select w-full ${INPUT_BASE}`}
                        >
                          {lightingAreas.length === 0 ? (
                            <option value="">尚未取得照明區域</option>
                          ) : lightingAreas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.display_name || area.hue_name || area.id}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
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

              const completing = isCompleting(todo);
              const isPublic = todo["類型"] === "公開";
              const lightNotify = todoLightNotify(todo);
              const lightAreaName = todo["燈光區域ID"] ? lightingAreaNameById[todo["燈光區域ID"]] : "";
              const urgency = todoUrgency(todo["日期"], todo["時間"]);
              const urgencyCls = urgencyRowClass(urgency);
              // 已 highlight 的 row 不再加 hover bg（會 muddy 兩層底色）
              const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";

              return (
                <li
                  key={sheetIndex}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-all duration-500 ${urgencyCls} ${hoverCls} ${
                    completing ? "opacity-40 line-through scale-95" : ""
                  }`}
                >
                  <button
                    onClick={() => !completing && completeTodo(todo)}
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
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1.5 text-sm text-foreground">
                      {todo["事項"]}
                      {isReadonly && <Lock className="h-3 w-3 text-faint" strokeWidth={2} />}
                      {lightNotify && <Lightbulb className="h-3 w-3 text-amber" strokeWidth={2} />}
                      {isRecurringInstance(todo) && (
                        <Repeat className="h-3 w-3 text-cool" strokeWidth={2} aria-label="週期任務" />
                      )}
                    </p>
                    <p className="num text-xs text-mute">
                      {todo["日期"]}
                      {(() => {
                        const rel = relativeDateLabel(todo["日期"]);
                        return rel ? ` (${rel})` : "";
                      })()}
                      {todo["時間"] && ` ${todo["時間"]}`}
                      {lightNotify && lightAreaName && ` · ${lightAreaName}`}
                      {!isMine(todo) && todo["負責人"] && ` · ${todo["負責人"]}`}
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
                        onClick={() => deleteTodo(todo)}
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

      {recurringRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>週期提醒</CardTitle>
            <span className="num text-xs text-mute">{recurringRules.length} 項</span>
          </CardHeader>
          <ul className="flex flex-col gap-1">
            {recurringRules.map((rule) => (
              <li
                key={rule["規則ID"]}
                className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-elevated/50"
              >
                <Repeat className="h-4 w-4 flex-shrink-0 text-cool" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{rule["事項"]}</p>
                  <p className="num text-xs text-mute">
                    {rule["摘要"]}
                    {rule["負責人"] && ` · ${rule["負責人"]}`}
                    {todoLightNotify(rule) && " · 燈光提醒"}
                  </p>
                </div>
                <IconActionButton
                  onClick={() => stopRecurring(rule)}
                  tone="danger"
                  title="停止整個週期"
                  icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
