"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";

interface Schedule {
  id: string;
  deviceName: string;
  action: string;
  params: string;
  triggerTime: string;
  creator: string;
  status: "pending" | "executed" | "expired";
}

const mockSchedules: Schedule[] = [
  { id: "1", deviceName: "客廳冷氣", action: "開啟", params: "26°C 冷氣模式", triggerTime: "2026-03-26T18:00", creator: "使用者 1", status: "pending" },
  { id: "2", deviceName: "除濕機", action: "關閉", params: "", triggerTime: "2026-03-26T22:00", creator: "使用者 1", status: "pending" },
  { id: "3", deviceName: "客廳冷氣", action: "關閉", params: "", triggerTime: "2026-03-26T08:00", creator: "使用者 2", status: "executed" },
  { id: "4", deviceName: "電扇", action: "開啟", params: "", triggerTime: "2026-03-25T14:00", creator: "使用者 1", status: "expired" },
];

const STATUS_CONFIG = {
  pending: { label: "等待中", color: "text-yellow-400", bg: "bg-yellow-400/10" },
  executed: { label: "已執行", color: "text-green-400", bg: "bg-green-400/10" },
  expired: { label: "已過期", color: "text-gray-500", bg: "bg-gray-500/10" },
};

export default function SchedulesPage() {
  const { currentUser } = useUser();
  const [schedules, setSchedules] = useState(mockSchedules);

  function deleteSchedule(id: string) {
    const schedule = schedules.find((s) => s.id === id);
    if (schedule && schedule.creator !== currentUser?.name) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  const pending = schedules.filter((s) => s.status === "pending");
  const past = schedules.filter((s) => s.status !== "pending");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">⏰ 排程管理</h1>

      {/* Pending */}
      <Card>
        <CardHeader>
          <CardTitle>等待中的排程</CardTitle>
          <span className="text-xs text-gray-500">{pending.length} 項</span>
        </CardHeader>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500">目前沒有等待中的排程</p>
        ) : (
          <div className="space-y-2">
            {pending.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg bg-gray-800/50 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">
                    {s.deviceName} — {s.action}
                    {s.params && <span className="ml-2 text-gray-400">{s.params}</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(s.triggerTime).toLocaleString("zh-TW")} · {s.creator}
                  </p>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[s.status].color} ${STATUS_CONFIG[s.status].bg}`}>
                  {STATUS_CONFIG[s.status].label}
                </span>
                {s.creator === currentUser?.name && (
                  <button
                    onClick={() => deleteSchedule(s.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Past */}
      <Card>
        <CardHeader>
          <CardTitle>歷史排程</CardTitle>
        </CardHeader>
        {past.length === 0 ? (
          <p className="text-sm text-gray-500">沒有歷史排程</p>
        ) : (
          <div className="space-y-2">
            {past.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg px-4 py-3 opacity-60">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300">
                    {s.deviceName} — {s.action}
                    {s.params && <span className="ml-2 text-gray-500">{s.params}</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(s.triggerTime).toLocaleString("zh-TW")} · {s.creator}
                  </p>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[s.status].color} ${STATUS_CONFIG[s.status].bg}`}>
                  {STATUS_CONFIG[s.status].label}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-gray-600">
        排程由 LINE 管家建立，可透過 LINE 對話新增排程
      </p>
    </div>
  );
}
