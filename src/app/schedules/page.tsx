"use client";

import { useState } from "react";
import { Clock, Plus, X, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Toggle2,
  Stepper,
  Segment,
  Field,
  PillButton,
  IconActionButton,
} from "@/components/ui/device-controls";
import { useUser } from "@/hooks/use-user";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

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

const ACTION_MAP: Record<string, string> = {
  "空調": "control_ac",
  "IR": "control_ir",
  "除濕機": "control_dehumidifier",
};

/** 從 schedule 的 params JSON 字串拆出可顯示的設定值。
 *  邏輯跟 row 上方的 paramsDisplay 共用一份解析。 */
interface ParsedParams {
  raw: string;
  power?: "on" | "off";
  temperature?: number;
  mode?: string;
  fanSpeed?: string;
  humidity?: number;
  button?: string;
  /** 給 row 顯示的「開機 · 27°C · 冷氣 · 風速:自動」字串。 */
  display: string;
}

function parseScheduleParams(rawJson: string): ParsedParams {
  const parsed: ParsedParams = { raw: rawJson, display: rawJson };
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

export default function SchedulesPage() {
  const { currentUser } = useUser();
  const { data: schedules, loading, refetch: fetchSchedules } = useCachedFetch<Schedule[]>("/api/schedules", []);
  const { data: devices } = useCachedFetch<DeviceData[]>("/api/devices", []);
  const { data: options } = useCachedFetch<DeviceOptions | null>("/api/devices/options", null);

  const [showAdd, setShowAdd] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
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
  const irButtons = (selectedDeviceData?.buttons ?? "")
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

  /** 渲染裝置控制 fields（不包外層 bg / padding，由 caller 包）。
   *  跟「新增排程」一樣的 form 結構但 disabled。後端 PATCH ready 之後
   *  拿掉 disabled、把 onChange 接 setter、底部加儲存/取消即可改成可編輯。
   *
   *  渲染決策：fields 直接吐出，沒有自帶外框；preview 跟 add form 各自決定
   *  要不要再加 bg-elevated/50 包一層。preview 整塊用單一 bg-elevated/50 容器
   *  跟 todo/food 的 inline edit 視覺一致。 */
  function renderPreviewControls(deviceData: DeviceData, parsed: ParsedParams) {
    if (!options) return null;
    const { type } = deviceData;
    if (type === "空調") {
      const power = parsed.power === "on";
      return (
        <>
          <Field label="電源">
            <Toggle2 value={power} onChange={() => {}} disabled />
          </Field>
          {power && (
            <>
              <Field label="溫度">
                <Stepper
                  value={parsed.temperature ?? 26}
                  onMinus={() => {}}
                  onPlus={() => {}}
                  disabled
                />
              </Field>
              <Field label="模式">
                <Segment
                  options={options.ac.modes}
                  value={parsed.mode}
                  onSelect={() => {}}
                  disabled
                />
              </Field>
              <Field label="風速">
                <Segment
                  options={options.ac.fan_speeds}
                  value={parsed.fanSpeed}
                  onSelect={() => {}}
                  disabled
                />
              </Field>
            </>
          )}
        </>
      );
    }
    if (type === "除濕機") {
      const power = parsed.power === "on";
      return (
        <>
          <Field label="電源">
            <Toggle2 value={power} onChange={() => {}} disabled />
          </Field>
          {power && (
            <>
              <Field label="模式">
                <Segment
                  options={options.dehumidifier.modes}
                  value={parsed.mode}
                  onSelect={() => {}}
                  disabled
                />
              </Field>
              <Field label="目標濕度">
                <Segment
                  options={options.dehumidifier.humidity.map((h) => ({ value: h, label: `${h}%` }))}
                  value={parsed.humidity}
                  onSelect={() => {}}
                  disabled
                />
              </Field>
            </>
          )}
        </>
      );
    }
    if (type === "IR") {
      // 用裝置自身的 buttons 欄位（schedule 的 button 只是「按下哪一個」）
      const btnList = (deviceData.buttons ?? "")
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      const opts = btnList.length > 0
        ? btnList.map((b) => ({ value: b, label: b }))
        : (parsed.button ? [{ value: parsed.button, label: parsed.button }] : []);
      return (
        <Field label="按鈕">
          <Segment
            options={opts}
            value={parsed.button}
            onSelect={() => {}}
            disabled
          />
        </Field>
      );
    }
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <Clock className="h-5 w-5 text-mute" strokeWidth={2} />
          排程管理
        </h1>
        <PillButton
          onClick={() => setShowAdd(!showAdd)}
          icon={<Plus className="h-4 w-4" strokeWidth={2.5} />}
        >
          新增排程
        </PillButton>
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
                className="field-select w-full rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground focus:border-cool focus:outline-none"
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
              const isPreviewing = previewKey === rowKey;
              const dev = controllable.find((d) => d.name === deviceName);

              return (
                <div key={index} className="flex flex-col">
                  <div className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-elevated/50 transition-colors">
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
                      onClick={() => setPreviewKey(isPreviewing ? null : rowKey)}
                      title={isPreviewing ? "收合預覽" : "預覽詳情"}
                      icon={<Eye className="h-3.5 w-3.5" strokeWidth={2} />}
                    />
                    <IconActionButton
                      onClick={() => deleteSchedule(deviceName, trigger)}
                      tone="danger"
                      title="刪除"
                      icon={<X className="h-3.5 w-3.5" strokeWidth={2} />}
                    />
                  </div>

                  {isPreviewing && (
                    <div className="mt-1 mx-3 mb-2 rounded-[12px] bg-elevated/50 px-3 py-3 space-y-3">
                      {dev && renderPreviewControls(dev, parsed)}
                      <Field label="日期">
                        <input
                          type="date"
                          value={(trigger.split(" ")[0]) ?? ""}
                          disabled
                          className="w-full min-w-0 rounded-[10px] border border-line bg-surface px-4 py-2.5 text-sm text-mute appearance-none disabled:cursor-not-allowed"
                        />
                      </Field>
                      <Field label="時間">
                        <input
                          type="time"
                          value={(trigger.split(" ")[1]) ?? ""}
                          disabled
                          className="w-full min-w-0 rounded-[10px] border border-line bg-surface px-4 py-2.5 text-sm text-mute appearance-none disabled:cursor-not-allowed"
                        />
                      </Field>
                      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-amber-bg px-3 py-2 text-xs text-amber">
                        <span>目前僅支援預覽，編輯功能等後端 PATCH route 上線</span>
                        <button
                          type="button"
                          onClick={() => setPreviewKey(null)}
                          className="flex-shrink-0 rounded-full border border-amber/30 bg-surface px-3 py-1 text-xs font-medium text-amber hover:bg-amber-bg"
                        >
                          收合
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
