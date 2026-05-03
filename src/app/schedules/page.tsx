"use client";

import { useState } from "react";
import { Clock, Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Toggle2,
  Stepper,
  Segment,
  Field,
} from "@/components/ui/device-controls";
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

  // AC params — 用 boolean 對齊 Toggle2 介面（過去 string "on"/"off"）
  const [acPower, setAcPower] = useState(true);
  const [acTemp, setAcTemp] = useState(26);
  const [acMode, setAcMode] = useState("");
  const [acFan, setAcFan] = useState("");

  // Dehumidifier params
  const [dhPower, setDhPower] = useState(true);
  const [dhMode, setDhMode] = useState("");
  const [dhHumidity, setDhHumidity] = useState<number | undefined>();

  // IR params
  const [irButton, setIrButton] = useState("");

  const controllable = devices.filter(d => d.type !== "感應器");
  const selectedDeviceData = controllable.find(d => d.name === selectedDevice);
  const selectedType = selectedDeviceData?.type ?? "";
  const irButtons = ((selectedDeviceData as unknown as { buttons?: string })?.buttons ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

  function resetForm() {
    setSelectedDevice("");
    setTriggerDate("");
    setTriggerTime("");
    setAcPower(true);
    setAcTemp(26);
    setAcMode("");
    setAcFan("");
    setDhPower(true);
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
      params = { power: acPower ? "on" : "off" };
      if (acPower) {
        if (acTemp) params.temperature = acTemp;
        if (acMode) params.mode = acMode;
        if (acFan) params.fan_speed = acFan;
      }
    } else if (selectedType === "除濕機") {
      params = { power: dhPower ? "on" : "off" };
      if (dhPower) {
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
          className="flex items-center gap-1 rounded-full bg-cool px-4 py-2 text-sm font-medium text-white hover:bg-cool/85 transition-colors"
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
            <Field label="裝置">
              <select
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                className="w-full rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground focus:border-cool focus:outline-none"
              >
                <option value="">選擇裝置...</option>
                {controllable.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}（{d.type}）</option>
                ))}
              </select>
            </Field>

            {/* AC Settings */}
            {selectedType === "空調" && options && (
              <div className="space-y-3.5 rounded-[14px] bg-elevated/50 p-3.5">
                <Field label="電源">
                  <Toggle2 value={acPower} onChange={setAcPower} />
                </Field>
                {acPower && (
                  <>
                    <Field label="溫度">
                      <Stepper
                        value={acTemp}
                        onMinus={() => setAcTemp(Math.max(options.ac.temperature.min, acTemp - 1))}
                        onPlus={() => setAcTemp(Math.min(options.ac.temperature.max, acTemp + 1))}
                      />
                    </Field>
                    <Field label="模式">
                      <Segment
                        options={options.ac.modes}
                        value={acMode || undefined}
                        onSelect={setAcMode}
                      />
                    </Field>
                    <Field label="風速">
                      <Segment
                        options={options.ac.fan_speeds}
                        value={acFan || undefined}
                        onSelect={setAcFan}
                      />
                    </Field>
                  </>
                )}
              </div>
            )}

            {/* Dehumidifier Settings */}
            {selectedType === "除濕機" && options && (
              <div className="space-y-3.5 rounded-[14px] bg-elevated/50 p-3.5">
                <Field label="電源">
                  <Toggle2 value={dhPower} onChange={setDhPower} />
                </Field>
                {dhPower && (
                  <>
                    <Field label="模式">
                      <Segment
                        options={options.dehumidifier.modes}
                        value={dhMode || undefined}
                        onSelect={setDhMode}
                      />
                    </Field>
                    <Field label="目標濕度">
                      <Segment
                        options={options.dehumidifier.humidity.map((h) => ({ value: h, label: `${h}%` }))}
                        value={dhHumidity}
                        onSelect={setDhHumidity}
                      />
                    </Field>
                  </>
                )}
              </div>
            )}

            {/* IR Settings */}
            {selectedType === "IR" && selectedDeviceData && irButtons.length > 0 && (
              <div className="rounded-[14px] bg-elevated/50 p-3.5">
                <Field label="按鈕">
                  <Segment
                    options={irButtons.map((b) => ({ value: b, label: b }))}
                    value={irButton || undefined}
                    onSelect={setIrButton}
                  />
                </Field>
              </div>
            )}

            {/* Trigger Time */}
            {selectedDevice && (
              <div className="space-y-3">
                <Field label="日期 *">
                  <input
                    type="date"
                    value={triggerDate}
                    onChange={(e) => setTriggerDate(e.target.value)}
                    className="w-full rounded-[10px] border border-line bg-elevated px-4 py-2.5 text-sm text-foreground focus:border-cool focus:outline-none appearance-none"
                  />
                </Field>
                <Field label="時間 *">
                  <input
                    type="time"
                    value={triggerTime}
                    onChange={(e) => setTriggerTime(e.target.value)}
                    className="w-full rounded-[10px] border border-line bg-elevated px-4 py-2.5 text-sm text-foreground focus:border-cool focus:outline-none appearance-none"
                  />
                </Field>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={addSchedule}
              disabled={!selectedDevice || !triggerDate || !triggerTime}
              className="w-full rounded-full bg-fresh px-5 py-2.5 text-sm font-semibold text-white hover:bg-fresh/85 disabled:bg-elevated disabled:text-mute transition-colors"
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
                <div key={index} className="flex items-center gap-3 rounded-[12px] bg-elevated/50 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-soft">
                      {deviceName} — {paramsDisplay}
                    </p>
                    <p className="text-xs text-mute">
                      {trigger} · {creator}
                    </p>
                  </div>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-amber-bg bg-amber/15" style={{ color: "var(--color-amber)", backgroundColor: "var(--color-amber-bg)" }}>
                    待執行
                  </span>
                  <button
                    onClick={() => deleteSchedule(deviceName, trigger)}
                    className="rounded-full p-1.5 text-mute hover:text-warm hover:bg-warm/10 transition-colors"
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
