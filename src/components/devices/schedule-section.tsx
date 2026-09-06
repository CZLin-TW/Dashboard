"use client";

import { useState } from "react";
import { Plus, Pencil, X, Clock } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { IconActionButton, FIELD_LABEL } from "@/components/ui/device-controls";
import { ScheduleForm, type ScheduleFormState } from "@/components/devices/schedule-form";
import {
  type Schedule,
  parseScheduleParams,
  toFormInitial,
  isPastTrigger,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/lib/schedule";
import type { DeviceData, DeviceOptions } from "@/lib/types";

// 裝置卡內嵌的排程區段；所有排程操作都從裝置卡進入。
// Pending schedules and attention records are separate: failed/unknown commands
// are never silently re-armed by editing. Users check the device and add a new schedule.
// 「新增」按鈕一直在（即使沒排程），讓進入點固定。

interface Props {
  device: DeviceData;
  options: DeviceOptions;
  /** 已用 device.name filter 過的清單（由 caller 處理過濾，元件不再 filter）。 */
  schedules: Schedule[];
  /** 所有裝置 list，給 ScheduleForm 內部 deviceMap 用（即使 lockedDevice 也需要 type 資訊）。 */
  allDevices: DeviceData[];
  /** CRUD 後呼叫，由父層 refetch /api/schedules。 */
  onSchedulesChange: () => void;
}

export function ScheduleSection({ device, options, schedules, allDevices, onSchedulesChange }: Props) {
  const { currentUser } = useUser();
  const [showAdd, setShowAdd] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openAdd() {
    setEditKey(null);
    setShowAdd(true);
  }

  function openEdit(key: string) {
    setShowAdd(false);
    setEditKey(key);
  }

  async function handleAdd(state: ScheduleFormState) {
    if (!currentUser) return;
    await createSchedule(state, currentUser.name);
    setShowAdd(false);
    onSchedulesChange();
  }

  async function handleEdit(original: Schedule, state: ScheduleFormState) {
    if (!currentUser) return;
    await updateSchedule(original, state, currentUser.name);
    setEditKey(null);
    onSchedulesChange();
  }

  async function handleDelete(schedule: Schedule) {
    setDeleteError(null);
    try {
      const attention = ["執行失敗", "待確認"].includes(schedule["狀態"]);
      await deleteSchedule(device.name, schedule["觸發時間"], attention ? schedule["執行識別碼"] : undefined);
      onSchedulesChange();
    } catch {
      setDeleteError("未能移除排程，請稍後重試。");
    }
  }

  const sorted = [...schedules].sort(
    (a, b) => (a["觸發時間"] ?? "").localeCompare(b["觸發時間"] ?? ""),
  );

  return (
    <div className="border-t border-line pt-3.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 ${FIELD_LABEL}`}>
          <Clock className="h-3 w-3" strokeWidth={2} />
          排程
          {sorted.length > 0 && (
            <span className="num text-mute">({sorted.length})</span>
          )}
        </span>
        {!showAdd && (
          <IconActionButton
            onClick={openAdd}
            title="新增排程"
            icon={<Plus className="h-3.5 w-3.5" strokeWidth={2} />}
          />
        )}
      </div>

      {showAdd && (
        <div className="rounded-[12px] bg-elevated/50 px-3 py-3">
          <ScheduleForm
            mode="add"
            devices={allDevices}
            options={options}
            lockedDevice={device.name}
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {sorted.length > 0 && (
        <div className="flex flex-col gap-1">
          {sorted.map((s, idx) => {
            const trigger = s["觸發時間"] ?? "";
            const params = s["參數"] ?? "";
            const creator = s["建立者"] ?? "";
            const parsed = parseScheduleParams(params);
            const rowKey = `${device.name}|${trigger}|${s["執行識別碼"] || "pending"}`;
            const isEditing = editKey === rowKey;
            const past = isPastTrigger(trigger);
            const status = s["狀態"] || "待執行";
            const attention = status === "執行失敗" || status === "待確認";

            if (isEditing) {
              return (
                <div key={idx} className="rounded-[12px] bg-elevated/50 px-3 py-3">
                  <ScheduleForm
                    key={rowKey}
                    mode="edit"
                    initial={toFormInitial(s, device)}
                    devices={allDevices}
                    options={options}
                    lockedDevice={device.name}
                    onSubmit={(state) => handleEdit(s, state)}
                    onCancel={() => setEditKey(null)}
                  />
                </div>
              );
            }

            return (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 hover:bg-elevated/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-foreground">
                    {parsed.display}
                  </p>
                  <p className="num text-[11px] text-mute">
                    {trigger}
                    {creator && <span className="ml-2">· {creator}</span>}
                  </p>
                  {attention && <p className="mt-1 text-xs leading-relaxed text-mute">{s["執行結果"] || "請先確認設備狀態。"}</p>}
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${status === "執行失敗" ? "bg-warm-bg text-warm" : "bg-amber-bg text-amber"}`}>
                  {attention ? status : past ? "即將執行" : "待執行"}
                </span>
                {!attention && <IconActionButton
                  onClick={() => openEdit(rowKey)}
                  title="編輯"
                  icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2} />}
                />}
                <IconActionButton
                  onClick={() => void handleDelete(s)}
                  tone="danger"
                  title={attention ? "移除紀錄" : "刪除"}
                  icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
                />
              </div>
            );
          })}
        </div>
      )}
      {sorted.some(s => ["執行失敗", "待確認"].includes(s["狀態"])) && <p className="text-xs leading-relaxed text-mute">失敗或待確認的指令不會自動重送。請先確認設備狀態，再新增排程；移除紀錄不會撤回已送出的指令。</p>}
      {deleteError && <p role="alert" className="text-xs text-warm">{deleteError}</p>}
    </div>
  );
}
