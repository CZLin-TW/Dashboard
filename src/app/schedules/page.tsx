"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

interface Schedule {
  [key: string]: string;
}

interface DeviceData {
  name: string;
  type: string;
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

const ACTION_MAP: Record<string, string> = {
  "空調": "control_ac",
  "IR": "control_ir",
  "除濕機": "control_dehumidifier",
};

export default function SchedulesPage() {
  const { currentUser } = useUser();
  const { data: schedules, loading, refetch: fetchSchedules } = useCachedFetch<Schedule[]>("/api/schedules", []);
  const { data: devices } = useCachedFetch<DeviceData[]>("/api/devices", []);
  const { data: options } = useCachedFetch<DeviceOptions | null>("/api/devices/options", null);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [triggerDate, setTriggerDate] = useState("");
  const [triggerTime, setTriggerTime] = useState("");

  // AC params
  const [acPower, setAcPower] = useState("on");
  const [acTemp, setAcTemp] = useState(26);
  const [acMode, setAcMode] = useState("");
  const [acFan, setAcFan] = useState("");

  // Dehumidifier params
  const [dhPower, setDhPower] = useState("on");
  const [dhMode, setDhMode] = useState("");
  const [dhHumidity, setDhHumidity] = useState<number | undefined>();

  // IR params
  const [irButton, setIrButton] = useState("");

  const controllable = devices.filter(d => d.type !== "感應器");
  const selectedDeviceData = controllable.find(d => d.name === selectedDevice);
  const selectedType = selectedDeviceData?.type ?? "";

  function resetForm() {
    setSelectedDevice("");
    setTriggerDate("");
    setTriggerTime("");
    setAcPower("on");
    setAcTemp(26);
    setAcMode("");
    setAcFan("");
    setDhPower("on");
    setDhMode("");
    setDhHumidity(undefined);
    setIrButton("");
  }

  function addSchedule() {
    if (!selectedDevice || !triggerDate || !triggerTime || !currentUser) return;

    const targetAction = ACTION_MAP[selectedType];
    if (!targetAction) return;

    let params: Record<string, unknown> = {};
    if (selectedType === "空調") {
      params = { power: acPower };
      if (acPower === "on") {
        if (acTemp) params.temperature = acTemp;
        if (acMode) params.mode = acMode;
        if (acFan) params.fan_speed = acFan;
      }
    } else if (selectedType === "除濕機") {
      params = { power: dhPower };
      if (dhPower === "on") {
        if (dhMode) params.mode = dhMode;
        if (dhHumidity) params.humidity = dhHumidity;
      }
    } else if (selectedType === "IR") {
      if (!irButton) return;
      params = { button: irButton };
    }

    fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_name: selectedDevice,
        target_action: targetAction,
        params,
        trigger_time: `${triggerDate} ${triggerTime}`,
        person: currentUser.name,
      }),
    }).then(() => {
      resetForm();
      setShowAdd(false);
      fetchSchedules();
    });
  }

  function deleteSchedule(deviceName: string, triggerTime: string) {
    fetch("/api/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_name: deviceName, trigger_time: triggerTime }),
    }).then(() => fetchSchedules());
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">⏰ 排程管理</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + 新增排程
        </button>
      </div>

      {/* Add Schedule Form */}
      {showAdd && (
        <Card>
          <div className="space-y-4">
            {/* Device Selection */}
            <div>
              <label className="text-xs text-gray-400">裝置</label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">選擇裝置...</option>
                {controllable.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}（{d.type}）</option>
                ))}
              </select>
            </div>

            {/* AC Settings */}
            {selectedType === "空調" && options && (
              <div className="space-y-3 rounded-lg bg-gray-800/50 p-3">
                <div>
                  <label className="text-xs text-gray-400">電源</label>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setAcPower("on")}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${acPower === "on" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>ON</button>
                    <button onClick={() => setAcPower("off")}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${acPower === "off" ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}>OFF</button>
                  </div>
                </div>
                {acPower === "on" && (
                  <>
                    <div>
                      <label className="text-xs text-gray-400">溫度</label>
                      <div className="mt-1 flex items-center gap-3">
                        <button onClick={() => setAcTemp(Math.max(options.ac.temperature.min, acTemp - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">−</button>
                        <span className="w-16 text-center text-lg font-bold">{acTemp}°C</span>
                        <button onClick={() => setAcTemp(Math.min(options.ac.temperature.max, acTemp + 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600">+</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">模式</label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {options.ac.modes.map((m) => (
                          <button key={m.value} onClick={() => setAcMode(m.value)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${acMode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{m.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">風速</label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {options.ac.fan_speeds.map((s) => (
                          <button key={s.value} onClick={() => setAcFan(s.value)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${acFan === s.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{s.label}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Dehumidifier Settings */}
            {selectedType === "除濕機" && options && (
              <div className="space-y-3 rounded-lg bg-gray-800/50 p-3">
                <div>
                  <label className="text-xs text-gray-400">電源</label>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setDhPower("on")}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${dhPower === "on" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>ON</button>
                    <button onClick={() => setDhPower("off")}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${dhPower === "off" ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}>OFF</button>
                  </div>
                </div>
                {dhPower === "on" && (
                  <>
                    <div>
                      <label className="text-xs text-gray-400">模式</label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {options.dehumidifier.modes.map((m) => (
                          <button key={m.value} onClick={() => setDhMode(m.value)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${dhMode === m.value ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{m.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">目標濕度</label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {options.dehumidifier.humidity.map((h) => (
                          <button key={h} onClick={() => setDhHumidity(h)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${dhHumidity === h ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{h}%</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* IR Settings */}
            {selectedType === "IR" && selectedDeviceData && (
              <div className="rounded-lg bg-gray-800/50 p-3">
                <label className="text-xs text-gray-400">按鈕</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {((selectedDeviceData as unknown as { buttons?: string }).buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map((btn) => (
                    <button key={btn} onClick={() => setIrButton(btn)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${irButton === btn ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}>{btn}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Trigger Time */}
            {selectedDevice && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">日期 *</label>
                  <input type="date" value={triggerDate}
                    onChange={(e) => setTriggerDate(e.target.value)}
                    className="mt-1 w-full max-w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none appearance-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">時間 *</label>
                  <input type="time" value={triggerTime}
                    onChange={(e) => setTriggerTime(e.target.value)}
                    className="mt-1 w-full max-w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none appearance-none" />
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={addSchedule}
              disabled={!selectedDevice || !triggerDate || !triggerTime}
              className="w-full rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
            >
              新增排程
            </button>
          </div>
        </Card>
      )}

      {/* Schedule List */}
      <Card>
        <CardHeader>
          <CardTitle>排程列表</CardTitle>
          <span className="text-xs text-gray-500">{schedules.length} 項</span>
        </CardHeader>
        {loading && schedules.length === 0 ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-gray-500">目前沒有排程</p>
        ) : (
          <div className="space-y-2">
            {[...schedules].sort((a, b) => (a["觸發時間"] ?? "").localeCompare(b["觸發時間"] ?? "")).map((s, index) => {
              const deviceName = s["設備名稱"] ?? "";
              const trigger = s["觸發時間"] ?? "";
              const action = s["動作"] ?? "";
              const params = s["參數"] ?? "";
              const creator = s["建立者"] ?? "";

              let paramsDisplay = params;
              try {
                const p = JSON.parse(params);
                const parts: string[] = [];
                if (p.power) parts.push(p.power === "off" ? "關機" : "開機");
                if (p.temperature) parts.push(`${p.temperature}°C`);
                if (p.mode) parts.push(p.mode);
                if (p.fan_speed) parts.push(`風速:${p.fan_speed}`);
                if (p.humidity) parts.push(`${p.humidity}%`);
                if (p.button) parts.push(p.button);
                if (parts.length) paramsDisplay = parts.join(" · ");
              } catch { /* keep raw */ }

              return (
                <div key={index} className="flex items-center gap-3 rounded-lg bg-gray-800/50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">
                      {deviceName} — {paramsDisplay}
                    </p>
                    <p className="text-xs text-gray-500">
                      {trigger} · {creator}
                    </p>
                  </div>
                  <span className="rounded-md px-2 py-0.5 text-xs font-medium text-yellow-400 bg-yellow-400/10">
                    待執行
                  </span>
                  <button
                    onClick={() => deleteSchedule(deviceName, trigger)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
