"use client";

import { useState } from "react";
import { Clock, Plus, X, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PillButton, IconActionButton } from "@/components/ui/device-controls";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { ScheduleForm, type ScheduleFormState, type ScheduleFormInitial } from "./schedule-form";

interface Schedule {
  [key: string]: string;
}

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

/** 從 schedule 的 params JSON 字串拆出可顯示的設定值。
 *  list row 用 display 字串，編輯展開時轉成 ScheduleFormInitial。 */
interface ParsedParams {
  power?: "on" | "off";
  temperature?: number;
  mode?: string;
  fanSpeed?: string;
  humidity?: number;
  button?: string;
  display: string;
}

function parseScheduleParams(rawJson: string): ParsedParams {
  const parsed: ParsedParams = { display: rawJson };
  try {
    const p = JSON.parse(rawJson);
    if (p.power === "on" || p.power === "off") parsed.power = p.power;
    if (typeof p.temperature === "number") parsed.temperature = p.temperature;
    if (typeof p.mode === "string") parsed.mode = p.mode;
    if (typeof p.fan_speed === "string") parsed.fanSpeed = p.fan_speed;
    if (typeof p.humidity === "number") parsed.humidity = p.humidity;
    if (typeof p.button === "string") parsed.button = p.button;

    const parts: string[] = [];
    if (parsed.power) parts.push(parsed.power === "off" ? "關機" : "開機");
    if (parsed.temperature !== undefined) parts.push(`${parsed.temperature}°C`);
    if (parsed.mode) parts.push(parsed.mode);
    if (parsed.fanSpeed) parts.push(`風速:${parsed.fanSpeed}`);
    if (parsed.humidity !== undefined) parts.push(`${parsed.humidity}%`);
    if (parsed.button) parts.push(parsed.button);
    if (parts.length) parsed.display = parts.join(" · ");
  } catch { /* keep raw display */ }
  return parsed;
}

/** 穩定排序的 JSON 字串，給 params diff 比對用（避免 key 順序不同造成假差異）。 */
function stableJson(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  return JSON.stringify(sortedKeys.map((k) => [k, obj[k]]));
}

function toFormInitial(s: Schedule, deviceData: DeviceData | undefined): ScheduleFormInitial {
  const trigger = s["觸發時間"] ?? "";
  const [date, time] = trigger.split(" ");
  const parsed = parseScheduleParams(s["參數"] ?? "");
  const initial: ScheduleFormInitial = {
    device_name: s["設備名稱"] ?? "",
    trigger_date: date ?? "",
    trigger_time: time ?? "",
  };
  if (deviceData?.type === "空調") {
    initial.ac = {
      power: parsed.power === "on",
      temperature: parsed.temperature ?? 26,
      mode: parsed.mode ?? "",
      fanSpeed: parsed.fanSpeed ?? "",
    };
  } else if (deviceData?.type === "除濕機") {
    initial.dehumidifier = {
      power: parsed.power === "on",
      mode: parsed.mode ?? "",
      humidity: parsed.humidity,
    };
  } else if (deviceData?.type === "IR") {
    initial.ir = { button: parsed.button ?? "" };
  }
  return initial;
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
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...state, person: currentUser.name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    setShowAdd(false);
    fetchSchedules();
  }

  async function handleEdit(originalSchedule: Schedule, state: ScheduleFormState) {
    if (!currentUser) return;
    const originalDevice = originalSchedule["設備名稱"] ?? "";
    const originalTrigger = originalSchedule["觸發時間"] ?? "";
    const originalAction = originalSchedule["動作"] ?? "";
    const originalParamsStr = originalSchedule["參數"] ?? "";

    // Diff 對齊 todo / food：只送有改動的欄位。
    // params 比較先 parse 成 object 再用排序後的 JSON 比，避免 sheet 寫入 key 順序不同造成假差異。
    const body: Record<string, unknown> = {
      device_name: originalDevice,
      trigger_time: originalTrigger,
      person: currentUser.name,
    };
    if (state.device_name !== originalDevice) body.device_name_new = state.device_name;
    if (state.target_action !== originalAction) body.target_action_new = state.target_action;
    if (state.trigger_time !== originalTrigger) body.trigger_time_new = state.trigger_time;
    let paramsChanged = true;
    try {
      const orig = JSON.parse(originalParamsStr) as Record<string, unknown>;
      paramsChanged = stableJson(orig) !== stableJson(state.params);
    } catch { /* 原始 JSON 壞的，當作有改 */ }
    if (paramsChanged) body.params_new = state.params;

    const hasChange = "device_name_new" in body || "target_action_new" in body
      || "trigger_time_new" in body || "params_new" in body;
    if (!hasChange) {
      setEditKey(null);
      return;
    }

    const res = await fetch("/api/schedules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    setEditKey(null);
    fetchSchedules();
  }

  function deleteSchedule(deviceName: string, triggerTime: string) {
    fetch("/api/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_name: deviceName, trigger_time: triggerTime }),
    }).then(() => fetchSchedules());
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
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <Clock className="h-5 w-5 text-mute" strokeWidth={2} />
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
                    onClick={() => deleteSchedule(deviceName, trigger)}
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
