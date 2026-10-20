// 排程（HomeButler v2）：以編號操作；時間進出都是家裡的牆上時間 "YYYY-MM-DD HH:MM"（due_local）。

import { send, type DevicesPage, type Schedule } from "@/lib/api";
import type { ScheduleFormInitial, ScheduleFormState } from "@/components/devices/schedule-form";

export type { Schedule };

const AC_LABELS: Record<string, string> = { cool: "冷氣", heat: "暖氣", dry: "除濕", fan_only: "送風", heat_cool: "自動" };
const FAN_LABELS: Record<string, string> = { auto: "自動", low: "低", medium: "中", high: "高" };

/** 一筆排程要做什麼，給列表顯示。 */
export function scheduleText(params: Record<string, unknown>): string {
  if (params.power === "off") return "關機";
  if (typeof params.button === "string") return params.button;
  const parts: string[] = params.power === "on" ? ["開機"] : [];
  if (typeof params.temperature === "number") parts.push(`${params.temperature}°C`);
  if (typeof params.mode === "string") parts.push(AC_LABELS[params.mode] ?? params.mode);
  if (typeof params.fan_speed === "string") parts.push(`風速:${FAN_LABELS[params.fan_speed] ?? params.fan_speed}`);
  if (typeof params.humidity === "number") parts.push(`${params.humidity}%`);
  return parts.join(" · ") || "—";
}

export function isAttention(s: Schedule): boolean {
  return s.status === "failed" || s.status === "unknown" || s.status === "claimed";
}

export function isPastTrigger(s: Schedule): boolean {
  return Date.parse(s.due_at) < Date.now();
}

export function toFormInitial(s: Schedule): ScheduleFormInitial {
  const [date, time] = s.due_local.split(" ");
  const p = s.params;
  return {
    device_name: s.target_name, trigger_date: date ?? "", trigger_time: time ?? "",
    ac: s.target_kind === "ac" ? { power: p.power !== "off", temperature: typeof p.temperature === "number" ? p.temperature : 26,
      mode: String(p.mode ?? ""), fanSpeed: String(p.fan_speed ?? "") } : undefined,
    dehumidifier: s.target_kind === "dehumidifier" ? { power: p.power !== "off", mode: String(p.mode ?? ""),
      humidity: typeof p.humidity === "number" ? p.humidity : undefined } : undefined,
    ir: s.target_kind === "ir" ? { button: String(p.button ?? "") } : undefined,
  };
}

export function createSchedule(state: ScheduleFormState): Promise<unknown> {
  return send("POST", "schedules", { target_kind: state.kind, target_name: state.name, params: state.params, due_local: state.due_local });
}

const sameParams = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** Sends only what changed; false when nothing did. */
export async function updateSchedule(original: Schedule, state: ScheduleFormState): Promise<boolean> {
  const changes: Record<string, unknown> = {};
  if (state.due_local !== original.due_local) changes.due_local = state.due_local;
  if (!sameParams(state.params, original.params)) changes.params = state.params;
  if (!Object.keys(changes).length) return false;
  await send("PATCH", `schedules/${original.id}`, changes);
  return true;
}

/** A pending one is cancelled; a failed or unknown one is dismissed (its result is kept). */
export function removeSchedule(s: Schedule): Promise<unknown> {
  return send("DELETE", `schedules/${s.id}`);
}

export function schedulesFor(page: DevicesPage | null, name: string): Schedule[] {
  return (page?.schedules ?? []).filter((s) => s.target_name === name).sort((a, b) => a.due_at.localeCompare(b.due_at));
}
