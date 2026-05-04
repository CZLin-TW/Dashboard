"use client";

import { useState } from "react";
import {
  Toggle2,
  Stepper,
  Segment,
  Field,
} from "@/components/ui/device-controls";

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

export interface ScheduleFormState {
  device_name: string;
  target_action: string;
  params: Record<string, unknown>;
  trigger_time: string; // "YYYY-MM-DD HH:MM"
}

export interface ScheduleFormInitial {
  device_name: string;
  trigger_date: string; // YYYY-MM-DD
  trigger_time: string; // HH:MM
  ac?: { power: boolean; temperature: number; mode: string; fanSpeed: string };
  dehumidifier?: { power: boolean; mode: string; humidity: number | undefined };
  ir?: { button: string };
}

interface Props {
  mode: "add" | "edit";
  initial?: ScheduleFormInitial;
  devices: DeviceData[];
  options: DeviceOptions | null;
  /** Add 模式：成功後呼叫；Edit 模式：caller 自己處理 PATCH。
   *  payload 是當前 form 完整狀態，caller 自己套上 person / 比對原值。 */
  onSubmit: (state: ScheduleFormState) => Promise<void> | void;
  /** Edit 模式才有意義；Add 模式呼叫 = 收合表單。 */
  onCancel: () => void;
}

/** 排程新增/編輯共用表單。父層用 `key` 控制 remount 來重設 initial state（不用 useEffect）。
 *
 *  跨類型切換策略：device 改成不同類型時，所有 params state 被重設（AC↔IR 沒共通欄位，
 *  硬保留會混亂）。同類型切換也重設—簡化邏輯、與「重填表單」語意一致。 */
export function ScheduleForm({ mode, initial, devices, options, onSubmit, onCancel }: Props) {
  const controllable = devices.filter((d) => d.type !== "感應器");

  const [selectedDevice, setSelectedDevice] = useState(initial?.device_name ?? "");
  const [triggerDate, setTriggerDate] = useState(initial?.trigger_date ?? "");
  const [triggerTime, setTriggerTime] = useState(initial?.trigger_time ?? "");

  const [acPower, setAcPower] = useState(initial?.ac?.power ?? true);
  const [acTemp, setAcTemp] = useState(initial?.ac?.temperature ?? 26);
  const [acMode, setAcMode] = useState(initial?.ac?.mode ?? "");
  const [acFan, setAcFan] = useState(initial?.ac?.fanSpeed ?? "");

  const [dhPower, setDhPower] = useState(initial?.dehumidifier?.power ?? true);
  const [dhMode, setDhMode] = useState(initial?.dehumidifier?.mode ?? "");
  const [dhHumidity, setDhHumidity] = useState<number | undefined>(initial?.dehumidifier?.humidity);

  const [irButton, setIrButton] = useState(initial?.ir?.button ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDeviceData = controllable.find((d) => d.name === selectedDevice);
  const selectedType = selectedDeviceData?.type ?? "";
  const irButtons = (selectedDeviceData?.buttons ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

  function handleDeviceChange(name: string) {
    setSelectedDevice(name);
    setAcPower(true);
    setAcTemp(26);
    setAcMode("");
    setAcFan("");
    setDhPower(true);
    setDhMode("");
    setDhHumidity(undefined);
    setIrButton("");
  }

  function buildPayload(): ScheduleFormState | null {
    if (!selectedDevice || !triggerDate || !triggerTime) return null;
    const targetAction = ACTION_MAP[selectedType];
    if (!targetAction) return null;

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
      if (!irButton) return null;
      params = { button: irButton };
    }

    return {
      device_name: selectedDevice,
      target_action: targetAction,
      params,
      trigger_time: `${triggerDate} ${triggerTime}`,
    };
  }

  async function handleSubmit() {
    const payload = buildPayload();
    if (!payload) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送出失敗");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!buildPayload() && !submitting;
  const submitLabel = mode === "edit" ? (submitting ? "儲存中..." : "儲存變更") : (submitting ? "新增中..." : "新增排程");

  return (
    <div className="space-y-4">
      <Field label="裝置">
        <select
          value={selectedDevice}
          onChange={(e) => handleDeviceChange(e.target.value)}
          className="field-select w-full rounded-[10px] border border-line bg-elevated px-3 py-2 text-sm text-foreground focus:border-cool focus:outline-none"
        >
          <option value="">選擇裝置...</option>
          {controllable.map((d) => (
            <option key={d.name} value={d.name}>{d.name}（{d.type}）</option>
          ))}
        </select>
      </Field>

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
                <Segment options={options.ac.modes} value={acMode || undefined} onSelect={setAcMode} />
              </Field>
              <Field label="風速">
                <Segment options={options.ac.fan_speeds} value={acFan || undefined} onSelect={setAcFan} />
              </Field>
            </>
          )}
        </div>
      )}

      {selectedType === "除濕機" && options && (
        <div className="space-y-3.5 rounded-[14px] bg-elevated/50 p-3.5">
          <Field label="電源">
            <Toggle2 value={dhPower} onChange={setDhPower} />
          </Field>
          {dhPower && (
            <>
              <Field label="模式">
                <Segment options={options.dehumidifier.modes} value={dhMode || undefined} onSelect={setDhMode} />
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

      {error && (
        <p className="rounded-[10px] bg-warm-bg px-3 py-2 text-xs text-warm">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 rounded-full bg-fresh px-5 py-2.5 text-sm font-semibold text-white hover:bg-fresh/85 disabled:bg-elevated disabled:text-mute transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium text-soft hover:bg-elevated transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
