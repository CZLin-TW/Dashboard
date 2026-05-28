"use client";

import { useState } from "react";
import { Clock, Plus, X, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PillButton, IconActionButton } from "@/components/ui/device-controls";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { ScheduleForm, type ScheduleFormState } from "./schedule-form";
import {
  type Schedule,
  parseScheduleParams,
  toFormInitial,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/lib/schedule";

interface DeviceData {
  name: string;
  type: string;
  buttons?: string;
}

interface DeviceOptions {
  ac: {
    modes: Array<{ value: string; label: string }>;
    fan_speeds: Array<{ value: string; label: string }>;
    temperature: { min: number; max: number };
  };
  dehumidifier: {
    modes: Array<{ value: string; label: string }>;
    humidity: number[];
  };
}

export default function SchedulesPage() {
  const { currentUser } = useUser();
  const { data: schedules, loading, refetch: fetchSchedules } = useCachedFetch<Schedule[]>("/api/schedules", []);
  const { data: devices } = useCachedFetch<DeviceData[]>("/api/devices", []);
  const { data: options } = useCachedFetch<DeviceOptions | null>("/api/devices/options", null);

  // showAdd 與 editKey 互斥：開新增表單會關閉編輯，反之亦然，避免兩個表單同時開。
  const [showAdd, setShowAdd] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);

  const controllable = devices.filter((d) => d.type !== "感應器");

  async function handleAdd(state: ScheduleFormState) {
    if (!currentUser) return;
    await createSchedule(state, currentUser.name);
    setShowAdd(false);
    fetchSchedules();
  }

  async function handleEdit(originalSchedule: Schedule, state: ScheduleFormState) {
    if (!currentUser) return;
    await updateSchedule(originalSchedule, state, currentUser.name);
    setEditKey(null);
    fetchSchedules();
  }

  function handleDelete(deviceName: string, triggerTime: string) {
    deleteSchedule(deviceName, triggerTime).then(() => fetchSchedules());
  }

  function openAdd() {
    setEditKey(null);
    setShowAdd(true);
  }

  function openEdit(rowKey: string) {
    setShowAdd(false);
    setEditKey(rowKey);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-mute">
          <Clock className="h-4 w-4" strokeWidth={2} />
          排程管理
        </h1>
        <PillButton
          onClick={() => (showAdd ? setShowAdd(false) : openAdd())}
          icon={<Plus className="h-4 w-4" strokeWidth={2.5} />}
        >
          新增排程
        </PillButton>
      </div>

      {showAdd && (
        <Card>
          <ScheduleForm
            mode="add"
            devices={devices}
            options={options}
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>排程列表</CardTitle>
          <span className="num text-xs text-mute">{schedules.length} 項</span>
        </CardHeader>
        {loading && schedules.length === 0 ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-mute">目前沒有排程</p>
        ) : (
          <div className="flex flex-col gap-1">
            {[...schedules].sort((a, b) => (a["觸發時間"] ?? "").localeCompare(b["觸發時間"] ?? "")).map((s, index) => {
              const deviceName = s["設備名稱"] ?? "";
              const trigger = s["觸發時間"] ?? "";
              const params = s["參數"] ?? "";
              const creator = s["建立者"] ?? "";
              const parsed = parseScheduleParams(params);
              const rowKey = `${deviceName}|${trigger}`;
              const isEditing = editKey === rowKey;
              const dev = controllable.find((d) => d.name === deviceName);

              if (isEditing) {
                return (
                  <div key={index} className="rounded-[12px] bg-elevated/50 px-3 py-3">
                    <ScheduleForm
                      key={rowKey}
                      mode="edit"
                      initial={toFormInitial(s, dev)}
                      devices={devices}
                      options={options}
                      onSubmit={(state) => handleEdit(s, state)}
                      onCancel={() => setEditKey(null)}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-elevated/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{deviceName}</span>
                      <span className="ml-2 text-mute">— {parsed.display}</span>
                    </p>
                    <p className="num text-xs text-mute">
                      {trigger} · {creator}
                    </p>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-amber-bg px-2 py-0.5 text-[11.5px] font-semibold text-amber">
                    待執行
                  </span>
                  <IconActionButton
                    onClick={() => openEdit(rowKey)}
                    title="編輯"
                    icon={<Pencil className="h-3.5 w-3.5" strokeWidth={2} />}
                  />
                  <IconActionButton
                    onClick={() => handleDelete(deviceName, trigger)}
                    tone="danger"
                    title="刪除"
                    icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
