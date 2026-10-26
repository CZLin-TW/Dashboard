"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Plus, Lock, Pencil, X, Check, Lightbulb, Repeat } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";
import {
  Field,
  PillButton,
  IconActionButton,
  Dropdown,
  Stepper,
} from "@/components/ui/device-controls";
import { todoUrgency, urgencyRowClass, relativeDateLabel } from "@/lib/types";
import { HB, send, type RecurrenceRule, type Todo, type TodoPage, type TodoTemplate } from "@/lib/api";
import { TodoAreaPicker } from "@/components/todo-area-picker";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useCompleteTodo } from "@/hooks/use-complete-todo";

// 週期任務的頻率選項 + 星期 + 月日。
const RECUR_TYPE_OPTIONS: { value: RecurrenceRule; label: string }[] = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每週" },
  { value: "monthly", label: "每月" },
  { value: "quarterly", label: "每季" },
  { value: "half_yearly", label: "每半年" },
  { value: "yearly", label: "每年" },
  { value: "every_n_days", label: "間隔天" },
];
// 每季/半年/每年：以起始日期當錨、每 3/6/12 個月重複同一天。
const MONTHLY_MULTIPLE_PERIOD: Partial<Record<RecurrenceRule, string>> = { quarterly: "3", half_yearly: "6", yearly: "12" };
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "一" }, { value: 2, label: "二" }, { value: 3, label: "三" },
  { value: 4, label: "四" }, { value: 5, label: "五" }, { value: 6, label: "六" },
  { value: 7, label: "日" },
];
const MONTH_DAY_OPTIONS: { value: number; label: string }[] =
  Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1} 號` }));
const VISIBILITY_LABEL = { private: "私人", public: "公開" } as const;

interface RecurState {
  type: RecurrenceRule;
  weekdays: number[];
  monthDay: number;
  interval: number;
  startDate: string;
  endDate: string;
}
const RECUR_DEFAULT: RecurState = { type: "daily", weekdays: [], monthDay: 1, interval: 3, startDate: "", endDate: "" };

interface Draft { title: string; date: string; time: string; visibility: "private" | "public"; light: boolean; areas: number[] }
const EMPTY_DRAFT: Draft = { title: "", date: "", time: "", visibility: "private", light: false, areas: [] };

// 不放 w-full 在 base，避免 flex item 被同時套 flex-1 + w-full 後在
// Chrome desktop 的 <input type="date"> 上被擠扁；單一 input 場合 caller 自己加 w-full。
const INPUT_BASE =
  "rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-cool focus:outline-none";

export default function TodosPage() {
  const { currentUser } = useUser();
  const { data, loading, hasData, refetch } = useCachedFetch<TodoPage>(HB("todos"),
    { todos: [], templates: [], light_areas: [], members: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [newTodo, setNewTodo] = useState<Draft>(EMPTY_DRAFT);
  const [hasTime, setHasTime] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editTodo, setEditTodo] = useState<Draft>(EMPTY_DRAFT);
  const { completeTodo, isCompleting } = useCompleteTodo(refetch);
  const [recurEnabled, setRecurEnabled] = useState(false);
  const [recur, setRecur] = useState<RecurState>(RECUR_DEFAULT);
  const lightingAreas = data.light_areas;
  const defaultLightAreaId = useMemo(
    () => (lightingAreas.find((a) => a.is_default) ?? lightingAreas[0])?.id, [lightingAreas]);
  const areaName = (id: number) => lightingAreas.find((a) => a.id === id)?.name ?? "原區域（目前不可用）";
  const defaultAreas = () => (defaultLightAreaId !== undefined ? [defaultLightAreaId] : []);
  const myName = currentUser?.name ?? "";
  const recurringRules = data.templates;

  // 後端已經只回「自己負責 + 公開」的項目。
  const filteredTodos = [...data.todos].sort((a, b) =>
    `${a.due_date ?? "9999"} ${a.due_time ?? "99:99"}`.localeCompare(`${b.due_date ?? "9999"} ${b.due_time ?? "99:99"}`));

  // 每週至少選一天才有效；其他類型一律有效。
  const recurValid = recur.type !== "weekly" || recur.weekdays.length > 0;

  function toggleWeekday(d: number) {
    setRecur((p) => ({
      ...p,
      weekdays: p.weekdays.includes(d) ? p.weekdays.filter((x) => x !== d) : [...p.weekdays, d].sort((a, b) => a - b),
    }));
  }

  function resetAddForm() {
    setNewTodo(EMPTY_DRAFT);
    setHasTime(false);
    setRecurEnabled(false);
    setRecur(RECUR_DEFAULT);
    setShowAdd(false);
  }

  async function run(action: () => Promise<unknown>, after: () => void) {
    try {
      await action();
      after();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失敗，請稍後重試。");
    } finally {
      await refetch();
    }
  }

  function addTodo() {
    const useLight = hasTime && newTodo.light;
    if (!newTodo.title.trim() || !currentUser || (useLight && !newTodo.areas.length)) return;
    if (recurEnabled) {
      if (!recurValid) return;
      const body: Record<string, unknown> = {
        title: newTodo.title.trim(), rule: recur.type, visibility: newTodo.visibility,
        due_time: hasTime ? newTodo.time || null : null, light_reminder: useLight,
        light_area_ids: useLight ? newTodo.areas : undefined, end_date: recur.endDate || undefined,
      };
      if (recur.type === "weekly") body.weekdays = recur.weekdays;
      if (recur.type === "monthly") body.month_day = recur.monthDay;
      if (recur.type === "every_n_days") body.interval_days = recur.interval;
      if (MONTHLY_MULTIPLE_PERIOD[recur.type] && recur.startDate) body.start_date = recur.startDate;
      void run(() => send("POST", "todo-templates", body), resetAddForm);
      return;
    }
    if (!newTodo.date) return;
    void run(() => send("POST", "todos", {
      title: newTodo.title.trim(), due_date: newTodo.date, due_time: hasTime ? newTodo.time || null : null,
      visibility: newTodo.visibility, light_reminder: useLight, light_area_ids: useLight ? newTodo.areas : undefined,
    }), resetAddForm);
  }

  function stopRecurring(rule: TodoTemplate) {
    const summary = rule.summary ? `（${rule.summary}）` : "";
    if (!confirm(`要永久停止整個週期提醒「${rule.title}」${summary} 嗎？\n已經產生在清單上的當次待辦不會被移除。`)) return;
    void run(() => send("DELETE", `todo-templates/${rule.id}`), () => {});
  }

  function startEdit(todo: Todo) {
    setEditing(todo.id);
    setEditTodo({ title: todo.title, date: todo.due_date ?? "", time: todo.due_time ?? "", visibility: todo.visibility,
      light: todo.light_reminder, areas: todo.light_reminder ? todo.light_area_ids : [] });
  }

  function saveEdit(todo: Todo) {
    if (editTodo.light && !editTodo.areas.length) return;
    const areasChanged = editTodo.light && (!todo.light_reminder || editTodo.areas.length !== todo.light_area_ids.length
      || editTodo.areas.some((id) => !todo.light_area_ids.includes(id)));
    const changes: Record<string, unknown> = {};
    if (editTodo.title !== todo.title) changes.title = editTodo.title;
    if (editTodo.date !== (todo.due_date ?? "")) changes.due_date = editTodo.date;
    if (editTodo.time !== (todo.due_time ?? "")) changes.due_time = editTodo.time;
    if (editTodo.visibility !== todo.visibility) changes.visibility = editTodo.visibility;
    if (editTodo.light !== todo.light_reminder) changes.light_reminder = editTodo.light;
    if (areasChanged) changes.light_area_ids = editTodo.areas;
    if (!Object.keys(changes).length) { setEditing(null); return; }
    void run(() => send("PATCH", `todos/${todo.id}`, changes), () => setEditing(null));
  }

  function deleteTodo(todo: Todo) {
    if (!confirm(`確定要刪除「${todo.title}」嗎？`)) return;
    void run(() => send("POST", `todos/${todo.id}/complete`), () => {});
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

      <Collapse open={showAdd}>
        <Card>
          <div className="space-y-3">
            <input
              type="text"
              value={newTodo.title}
              onChange={(e) => setNewTodo((p) => ({ ...p, title: e.target.value }))}
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
                    onSelect={(v) => setRecur((p) => ({ ...p, type: v as RecurrenceRule }))}
                    className="w-full"
                  />
                </Field>
                {recur.type === "weekly" && (
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
                {recur.type === "monthly" && (
                  <Field label="每月幾號">
                    <Dropdown
                      options={MONTH_DAY_OPTIONS}
                      value={recur.monthDay}
                      onSelect={(v) => setRecur((p) => ({ ...p, monthDay: v }))}
                    />
                  </Field>
                )}
                {recur.type === "every_n_days" && (
                  <Field label="每隔幾天">
                    <Stepper
                      value={recur.interval}
                      unit="天"
                      min={1}
                      onMinus={() => setRecur((p) => ({ ...p, interval: Math.max(1, p.interval - 1) }))}
                      onPlus={() => setRecur((p) => ({ ...p, interval: p.interval + 1 }))}
                      onChange={(v) => setRecur((p) => ({ ...p, interval: Math.max(1, v) }))}
                    />
                  </Field>
                )}
                {!!MONTHLY_MULTIPLE_PERIOD[recur.type] && (
                  <>
                    <Field label="起始日（首次；留空＝今天）">
                      <input
                        type="date"
                        value={recur.startDate}
                        onChange={(e) => setRecur((p) => ({ ...p, startDate: e.target.value }))}
                        className={`w-full ${INPUT_BASE} appearance-none`}
                      />
                    </Field>
                    <p className="text-[11px] text-faint">
                      之後每 {MONTHLY_MULTIPLE_PERIOD[recur.type]} 個月重複同一天（月底自動落當月最後一天）。
                    </p>
                  </>
                )}
                <Field label="結束日期（選填）">
                  <input
                    type="date"
                    value={recur.endDate}
                    onChange={(e) => setRecur((p) => ({ ...p, endDate: e.target.value }))}
                    className={`w-full ${INPUT_BASE} appearance-none`}
                  />
                </Field>
                {recur.type === "monthly" && (
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
                    if (!next) setNewTodo((p) => ({ ...p, time: "", light: false, areas: [] }));
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
                checked={newTodo.light}
                disabled={!hasTime}
                onChange={(e) => setNewTodo((p) => ({
                  ...p, light: e.target.checked, areas: e.target.checked ? (p.areas.length ? p.areas : defaultAreas()) : [],
                }))}
                className="h-3.5 w-3.5 rounded border-line accent-cool disabled:opacity-40"
              />
              <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
              燈光提醒
            </label>
            {hasTime && newTodo.light && (
              <TodoAreaPicker areas={lightingAreas} selected={newTodo.areas}
                onChange={(ids) => setNewTodo((p) => ({ ...p, areas: ids }))} />
            )}
            <Field label="類型">
              <select
                value={newTodo.visibility}
                onChange={(e) => setNewTodo((p) => ({ ...p, visibility: e.target.value as Draft["visibility"] }))}
                className={`field-select w-full ${INPUT_BASE}`}
              >
                <option value="private">私人</option>
                <option value="public">公開</option>
              </select>
            </Field>
            <button
              onClick={addTodo}
              disabled={!newTodo.title.trim() || (recurEnabled ? !recurValid : !newTodo.date) || (hasTime && newTodo.light && !newTodo.areas.length)}
              className="w-full rounded-full bg-cool px-5 py-2.5 text-sm font-semibold text-white hover:bg-cool/85 disabled:bg-elevated disabled:text-mute transition-colors"
            >
              {recurEnabled ? "確認新增週期提醒" : "確認新增"}
            </button>
          </div>
        </Card>
      </Collapse>

      <Card>
        <CardHeader>
          <CardTitle>待辦事項</CardTitle>
          <span className="num text-xs text-mute">{hasData ? `${filteredTodos.length} 項` : "—"}</span>
        </CardHeader>
        {loading && !hasData ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : !hasData ? (
          <p className="text-sm text-mute">尚未取得待辦資料，請重新讀取。</p>
        ) : filteredTodos.length === 0 ? (
          <p className="text-sm text-mute">沒有待辦事項</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {filteredTodos.map((todo) => {
              const isReadonly = todo.read_only;
              const isEditing = editing === todo.id;

              if (isEditing) {
                return (
                  <li
                    key={todo.id}
                    className="rounded-[12px] bg-elevated/50 px-3 py-3 space-y-2.5"
                  >
                    <input
                      type="text"
                      value={editTodo.title}
                      onChange={(e) => setEditTodo((p) => ({ ...p, title: e.target.value }))}
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
                          light: e.target.value ? p.light : false,
                          areas: e.target.value ? p.areas : [],
                        }))}
                        className={`w-28 ${INPUT_BASE}`}
                      />
                      <select
                        value={editTodo.visibility}
                        onChange={(e) => setEditTodo((p) => ({ ...p, visibility: e.target.value as Draft["visibility"] }))}
                        className={`field-select w-24 ${INPUT_BASE}`}
                      >
                        <option value="private">私人</option>
                        <option value="public">公開</option>
                      </select>
                    </div>
                    <label
                      className={`flex items-center gap-2 text-[12.5px] select-none ${
                        editTodo.time ? "cursor-pointer text-mute" : "cursor-not-allowed text-faint"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={editTodo.light}
                        disabled={!editTodo.time}
                        onChange={(e) => setEditTodo((p) => ({
                          ...p, light: e.target.checked, areas: e.target.checked ? (p.areas.length ? p.areas : defaultAreas()) : [],
                        }))}
                        className="h-3.5 w-3.5 rounded border-line accent-cool disabled:opacity-40"
                      />
                      <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
                      燈光提醒
                    </label>
                    {editTodo.time && editTodo.light && (
                      <TodoAreaPicker areas={lightingAreas} selected={editTodo.areas}
                        onChange={(ids) => setEditTodo((p) => ({ ...p, areas: ids }))} />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(todo)}
                        disabled={editTodo.light && !editTodo.areas.length}
                        className="rounded-full bg-cool px-4 py-1.5 text-xs font-semibold text-white hover:bg-cool/85 disabled:opacity-40"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-full border border-line bg-elevated px-4 py-1.5 text-xs font-medium text-soft hover:bg-elevated/80"
                      >
                        取消
                      </button>
                    </div>
                  </li>
                );
              }

              const completing = isCompleting(todo);
              const isPublic = todo.visibility === "public";
              const lightNotify = todo.light_reminder;
              const lightAreaName = todo.light_area_ids.map(areaName).join("、");
              const urgency = todoUrgency(todo.due_date ?? "", todo.due_time ?? "");
              const urgencyCls = urgencyRowClass(urgency);
              // 已 highlight 的 row 不再加 hover bg（會 muddy 兩層底色）
              const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";

              return (
                <li
                  key={todo.id}
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
                      {todo.title}
                      {isReadonly && <Lock className="h-3 w-3 text-faint" strokeWidth={2} />}
                      {lightNotify && <Lightbulb className="h-3 w-3 text-amber" strokeWidth={2} />}
                      {todo.template_id !== null && (
                        <Repeat className="h-3 w-3 text-cool" strokeWidth={2} aria-label="週期任務" />
                      )}
                    </p>
                    <p className="num text-xs text-mute">
                      {todo.due_date}
                      {(() => {
                        const rel = relativeDateLabel(todo.due_date ?? "");
                        return rel ? ` (${rel})` : "";
                      })()}
                      {todo.due_time && ` ${todo.due_time}`}
                      {lightNotify && lightAreaName && ` · ${lightAreaName}`}
                      {todo.assignee && todo.assignee !== myName && ` · ${todo.assignee}`}
                      {todo.source === "notion" && " · 來自 Notion"}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
                      isPublic ? "bg-elevated text-mute" : "bg-cool-bg text-cool"
                    }`}
                  >
                    {VISIBILITY_LABEL[todo.visibility]}
                  </span>
                  {!isReadonly && (
                    <div className="flex items-center gap-1">
                      <IconActionButton
                        onClick={() => startEdit(todo)}
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
                key={rule.id}
                className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-elevated/50"
              >
                <Repeat className="h-4 w-4 flex-shrink-0 text-cool" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{rule.title}</p>
                  <p className="num text-xs text-mute">
                    {rule.summary}
                    {rule.assignee && ` · ${rule.assignee}`}
                    {rule.light_reminder && ` · 燈光提醒：${rule.light_area_ids.map(areaName).join("、")}`}
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
