"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";

interface Schedule {
  [key: string]: string;
}

export default function SchedulesPage() {
  const { currentUser } = useUser();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedules = useCallback(() => {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSchedules(data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  function deleteSchedule(index: number) {
    fetch(`/api/schedules?index=${index}`, { method: "DELETE" }).then(() => fetchSchedules());
  }

  // Try to detect column names from the data
  const headers = schedules.length > 0 ? Object.keys(schedules[0]) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">⏰ 排程管理</h1>

      <Card>
        <CardHeader>
          <CardTitle>排程列表</CardTitle>
          <span className="text-xs text-gray-500">{schedules.length} 項</span>
        </CardHeader>
        {loading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-gray-500">目前沒有排程</p>
        ) : (
          <div className="space-y-2">
            {schedules.map((s, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg bg-gray-800/50 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">
                    {headers.map((h) => s[h]).filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  onClick={() => deleteSchedule(index)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
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
