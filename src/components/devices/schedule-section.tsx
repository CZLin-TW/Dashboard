"use client";

import { useRef, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { IconActionButton, ControlDetails } from "@/components/ui/device-controls";
import { ScheduleForm, type ScheduleFormState } from "@/components/devices/schedule-form";
import { createSchedule, isAttention, isPastTrigger, removeSchedule, scheduleText, toFormInitial, updateSchedule,
  type Schedule } from "@/lib/schedule";
import type { AutoOff, DevicesPage } from "@/lib/api";
import type { UiDevice } from "@/lib/devices";
import { autoOffSummary } from "@/lib/ac";

// 裝置卡內嵌的排程區段；所有排程操作都從裝置卡進入。
// 失敗／未確認的指令不會因為編輯而被重新排入：使用者先確認設備，再新增一筆。
// 「新增」按鈕一直在（即使沒排程），讓進入點固定。

interface Props {
  device: UiDevice;
  page: DevicesPage;
  /** 這台的排程（呼叫端已過濾）。 */
  schedules: Schedule[];
  /** 所有裝置，表單需要各台的按鈕與選項。 */
  allDevices: UiDevice[];
  onSchedulesChange: () => void;
  autoOff?: AutoOff;
  /** The page shows its last saved copy and a fresh one is on the way: schedules depend on the current
   *  state and time, so adding, editing and removing wait for it (device commands do not). */
  waiting?: boolean;
}

export function ScheduleSection({ device, page, schedules, allDevices, onSchedulesChange, autoOff, waiting = false }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteInFlight = useRef(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleAdd(state: ScheduleFormState) {
    await createSchedule(state);
    setShowAdd(false);
    onSchedulesChange();
  }

  async function handleEdit(original: Schedule, state: ScheduleFormState) {
    await updateSchedule(original, state);
    setEditId(null);
    onSchedulesChange();
  }

  async function handleDelete(schedule: Schedule) {
    if (deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeSchedule(schedule);
      onSchedulesChange();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "未能移除排程，請稍後重試。");
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }

  const autoOffInfo = device.kind === "ac" && autoOff ? autoOffSummary({
    hours: autoOff.hours, status: autoOff.status, scheduled_at: autoOff.scheduled_at, problems: autoOff.problems,
    hours_text: autoOff.hours_text, window_text: autoOff.window_text, window: autoOff.window,
    preview_off_at: autoOff.preview_off_at ? localTime(autoOff.preview_off_at) : null,
  }) : null;
  const attentionCount = schedules.filter(isAttention).length;
  return (
    <ControlDetails title="排程" keepMounted summary={attentionCount ? `${attentionCount} 筆待確認` : schedules.length ? `${schedules.length} 筆` : "尚未設定"}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="text-xs text-mute">指定時間執行一次</p>
        {!showAdd && <button type="button" disabled={deleting || waiting} title={waiting ? "更新中" : undefined} onClick={() => { setEditId(null); setShowAdd(true); }}
          className="inline-flex h-[38px] shrink-0 items-center gap-1 rounded-full bg-cool px-3 text-[13px] font-medium text-white hover:bg-cool/85 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />新增排程
        </button>}
      </div>

      {autoOffInfo && (
        <div className="min-w-0 space-y-1">
          <p className="text-xs leading-relaxed text-mute">{autoOffInfo.text}</p>
          {autoOffInfo.warnings.map((warning) => (
            <p key={warning} role="status" className="text-xs leading-relaxed text-warm">{warning}</p>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="min-w-0 rounded-[14px] border border-line/70 bg-surface p-3">
          <ScheduleForm mode="add" devices={allDevices} options={page.options} lockedDevice={device.name}
            onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {schedules.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2">
          {schedules.map((s) => {
            const attention = isAttention(s);
            if (editId === s.id) {
              return (
                <div key={s.id} className="min-w-0 rounded-[14px] border border-line/70 bg-surface p-3">
                  <ScheduleForm key={s.id} mode="edit" initial={toFormInitial(s)} devices={allDevices} options={page.options}
                    lockedDevice={device.name} onSubmit={(state) => handleEdit(s, state)} onCancel={() => setEditId(null)} />
                </div>
              );
            }
            return (
              <div key={s.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-[14px] border border-line/70 bg-surface p-3">
                <div className="min-w-0 w-full">
                  <p className="text-[13px] text-foreground">
                    {scheduleText(s.params)}{s.source === "auto_off" && <span className="ml-2 text-xs text-mute">· 自動產生</span>}
                  </p>
                  <p className="num text-xs text-mute">
                    {s.due_local}
                    {s.created_by && <span className="ml-2">· {s.created_by}</span>}
                  </p>
                  {attention && <p className="mt-1 text-xs leading-relaxed text-mute">{s.result || "請先確認設備狀態。"}</p>}
                </div>
                <span className={`mr-auto flex-shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${s.status === "failed" ? "bg-warm-bg text-warm" : "bg-amber-bg text-amber"}`}>
                  {attention ? s.status_label : isPastTrigger(s) ? "即將執行" : "待執行"}
                </span>
                {s.editable && <IconActionButton onClick={() => { setShowAdd(false); setEditId(s.id); }} title="編輯" disabled={deleting || waiting}
                  icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2} />} />}
                {s.status !== "claimed" && <IconActionButton onClick={() => void handleDelete(s)} tone="danger" disabled={deleting || waiting}
                  title={attention ? "移除紀錄" : "刪除"} icon={<X className="h-3.5 w-3.5" strokeWidth={2} />} />}
              </div>
            );
          })}
        </div>
      )}
      {attentionCount > 0 && <p className="text-xs leading-relaxed text-mute">失敗或待確認的指令不會自動重送。請先確認設備狀態，再新增排程；移除紀錄不會撤回已送出的指令。</p>}
      {deleteError && <p role="alert" className="text-xs text-warm">{deleteError}</p>}
    </ControlDetails>
  );
}

/** "YYYY-MM-DD HH:MM" in this browser's clock (the household's, in practice). */
function localTime(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
