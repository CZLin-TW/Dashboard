"use client";

import { useState } from "react";
import { Clock, Plus, X } from "lucide-react";
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
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Clock className="h-6 w-6" strokeWidth={2} />
          排程管理
        </h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 rounded-lg bg-cool px-4 py-2 text-sm font-medium text-white hover:bg-cool/85 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          新增排程
        </button>
      </div>

      {/* Add Schedule Form */}
      {showAdd && (
        <Card>
          <div className="space-y-4">
            {/* Device Selection */}
            <div>
              <label className="text-xs text-mute">裝置</label>
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-mute/15 bg-elevated px-3 py-2 text-sm text-white focus:border-cool focus:outline-none"
              >
                <option value="">選擇裝置...</option>
                {controllable.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}（{d.type}）</option>
                ))}
              </select>
            </div>

            {/* AC Settings */}
            {selectedType === "空調" && options && (
              <div className="space-y-3 rounded-lg bg-elevated/50 p-3">
                <div>
                  <label className="text-xs text-mute">電源</label>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setAcPower("on")}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${acPower === "on" ? "bg-cool text-white" : "bg-elevated text-soft"}`}>ON</button>
                    <button onClick={() => setAcPower("off")}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${acPower === "off" ? "bg-warm text-white" : "bg-elevated text-soft"}`}>OFF</button>
                  </div>
                </div>
                {acPower === "on" && (
                  <>
                    <div>
                      <label className="text-xs text-mute">溫度</label>
                      <div className="mt-1 flex items-center gap-2">
                        <button onClick={() => setAcTemp(Math.max(options.ac.temperature.min, acTemp - 1))}
                          className="flex h-7 w-7 items-center justify-center rounded bg-elevated hover:bg-mute/20 text-sm">−</button>
                        <span className="w-14 text-center font-bold">{acTemp}°C</span>
                        <button onClick={() => setAcTemp(Math.min(options.ac.temperature.max, acTemp + 1))}
                          className="flex h-7 w-7 items-center justify-center rounded bg-elevated hover:bg-mute/20 text-sm">+</button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-mute">模式</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {options.ac.modes.map((m) => (
                          <button key={m.value} onClick={() => setAcMode(m.value)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${acMode === m.value ? "bg-cool text-white" : "bg-elevated text-soft"}`}>{m.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-mute">風速</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {options.ac.fan_speeds.map((s) => (
                          <button key={s.value} onClick={() => setAcFan(s.value)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${acFan === s.value ? "bg-cool text-white" : "bg-elevated text-soft"}`}>{s.label}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Dehumidifier Settings */}
            {selectedType === "除濕機" && options && (
              <div className="space-y-3 rounded-lg bg-elevated/50 p-3">
                <div>
                  <label className="text-xs text-mute">電源</label>
                  <div className="mt-1 flex gap-2">
                    <button onClick={() => setDhPower("on")}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${dhPower === "on" ? "bg-cool text-white" : "bg-elevated text-soft"}`}>ON</button>
                    <button onClick={() => setDhPower("off")}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${dhPower === "off" ? "bg-warm text-white" : "bg-elevated text-soft"}`}>OFF</button>
                  </div>
                </div>
                {dhPower === "on" && (
                  <>
                    <div>
                      <label className="text-xs text-mute">模式</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {options.dehumidifier.modes.map((m) => (
                          <button key={m.value} onClick={() => setDhMode(m.value)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${dhMode === m.value ? "bg-cool text-white" : "bg-elevated text-soft"}`}>{m.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-mute">目標濕度</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {options.dehumidifier.humidity.map((h) => (
                          <button key={h} onClick={() => setDhHumidity(h)}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${dhHumidity === h ? "bg-cool text-white" : "bg-elevated text-soft"}`}>{h}%</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* IR Settings */}
            {selectedType === "IR" && selectedDeviceData && (
              <div className="rounded-lg bg-elevated/50 p-3">
                <label className="text-xs text-mute">按鈕</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {((selectedDeviceData as unknown as { buttons?: string }).buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map((btn) => (
                    <button key={btn} onClick={() => setIrButton(btn)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${irButton === btn ? "bg-cool text-white" : "bg-elevated text-soft"}`}>{btn}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Trigger Time */}
            {selectedDevice && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-mute">日期 *</label>
                  <input type="date" value={triggerDate}
                    onChange={(e) => setTriggerDate(e.target.value)}
                    className="mt-1 w-full max-w-full rounded-lg border border-mute/15 bg-elevated px-4 py-2.5 text-sm text-white focus:border-cool focus:outline-none appearance-none" />
                </div>
                <div>
                  <label className="text-xs text-mute">時間 *</label>
                  <input type="time" value={triggerTime}
                    onChange={(e) => setTriggerTime(e.target.value)}
                    className="mt-1 w-full max-w-full rounded-lg border border-mute/15 bg-elevated px-4 py-2.5 text-sm text-white focus:border-cool focus:outline-none appearance-none" />
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={addSchedule}
              disabled={!selectedDevice || !triggerDate || !triggerTime}
              className="w-full rounded-lg bg-fresh px-5 py-2.5 text-sm font-medium text-white hover:bg-fresh/85 disabled:bg-elevated disabled:text-mute transition-colors"
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
          <span className="text-xs text-mute">{schedules.length} 項</span>
        </CardHeader>
        {loading && schedules.length === 0 ? (
          <p className="text-sm text-mute">載入中...</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-mute">目前沒有排程</p>
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
                <div key={index} className="flex items-center gap-3 rounded-lg bg-elevated/50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-soft">
                      {deviceName} — {paramsDisplay}
                    </p>
                    <p className="text-xs text-mute">
                      {trigger} · {creator}
                    </p>
                  </div>
                  <span className="rounded-md px-2 py-0.5 text-xs font-medium text-amber-600 bg-amber-500/15">
                    待執行
                  </span>
                  <button
                    onClick={() => deleteSchedule(deviceName, trigger)}
                    className="rounded p-1.5 text-mute hover:text-warm hover:bg-warm/10 transition-colors"
                    title="刪除"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
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
