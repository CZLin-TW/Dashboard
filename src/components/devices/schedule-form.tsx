"use client";

import { useRef, useState } from "react";
import {
  Toggle2,
  Stepper,
  Dropdown,
  Field,
} from "@/components/ui/device-controls";

interface DeviceData {
  name: string;
  type: string;
  brand?: string;
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
    byBrand?: Record<string, { modes: Array<{ value: string; label: string }>; humidity: number[] }>;
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
  /** 鎖定裝置：傳入時隱藏「裝置」selector、initial.device_name 必為此值。
   *  裝置卡內嵌使用時設這個，避免使用者在某裝置卡裡建另一台的排程。 */
  lockedDevice?: string;
}

/** 排程新增/編輯共用表單。父層用 `key` 控制 remount 來重設 initial state（不用 useEffect）。
 *
 *  跨類型切換策略：device 改成不同類型時，所有 params state 被重設（AC↔IR 沒共通欄位，
 *  硬保留會混亂）。同類型切換也重設—簡化邏輯、與「重填表單」語意一致。 */
export function ScheduleForm({ mode, initial, devices, options, onSubmit, onCancel, lockedDevice }: Props) {
  const controllable = devices.filter((d) => d.type !== "感應器");

  const [selectedDevice, setSelectedDevice] = useState(lockedDevice ?? initial?.device_name ?? "");
  const [triggerDate, setTriggerDate] = useState(initial?.trigger_date ?? "");
  const [triggerTime, setTriggerTime] = useState(initial?.trigger_time ?? "");

  const [acPower, setAcPower] = useState(initial?.ac?.power ?? true);
  const [acTemp, setAcTemp] = useState(initial?.ac?.temperature ?? 26);
  const [acMode, setAcMode] = useState(initial?.ac?.mode || options?.ac.modes[0]?.value || "");
  const [acFan, setAcFan] = useState(initial?.ac?.fanSpeed || options?.ac.fan_speeds[0]?.value || "");

  const [dhPower, setDhPower] = useState(initial?.dehumidifier?.power ?? true);
  const [dhMode, setDhMode] = useState(initial?.dehumidifier?.mode ?? "");
  const [dhHumidity, setDhHumidity] = useState<number | undefined>(initial?.dehumidifier?.humidity);

  const [irButton, setIrButton] = useState(initial?.ir?.button ?? "");

  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDeviceData = controllable.find((d) => d.name === selectedDevice);
  const selectedType = selectedDeviceData?.type ?? "";
  const irButtons = (selectedDeviceData?.buttons ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  // 除濕機排程：依選到裝置的品牌取對應模式/濕度選項（缺值 fallback 到頂層 = Panasonic）
  const dhOptions =
    options?.dehumidifier.byBrand?.[selectedDeviceData?.brand || "Panasonic"] ??
    options?.dehumidifier ?? { modes: [], humidity: [] };

  function handleDeviceChange(name: string) {
    setSelectedDevice(name);
    setAcPower(true);
    setAcTemp(26);
    setAcMode(options?.ac.modes[0]?.value || "");
    setAcFan(options?.ac.fan_speeds[0]?.value || "");
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
    if (!payload || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "送出失敗");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const canSubmit = !!buildPayload() && !submitting;
  const submitLabel = mode === "edit" ? (submitting ? "儲存中..." : "儲存變更") : (submitting ? "新增中..." : "新增排程");

  return (
    <fieldset disabled={submitting} className="min-w-0 space-y-4 border-0 p-0">
      {!lockedDevice && (
        <Field label="裝置">
          <Dropdown ariaLabel="排程裝置" options={controllable.map(d => ({value:d.name,label:`${d.name}（${d.type}）`}))}
            value={selectedDevice || undefined} onSelect={handleDeviceChange} placeholder="選擇裝置" className="w-full" />
        </Field>
      )}

      {selectedType === "空調" && options && (
        <div className="space-y-3">
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
                <Dropdown ariaLabel="排程空調模式" className="w-full" options={options.ac.modes} value={acMode || undefined} onSelect={setAcMode} />
              </Field>
              <Field label="風速">
                <Dropdown ariaLabel="排程空調風速" className="w-full" options={options.ac.fan_speeds} value={acFan || undefined} onSelect={setAcFan} />
              </Field>
            </>
          )}
        </div>
      )}

      {selectedType === "除濕機" && options && (
        <div className="space-y-3">
          <Field label="電源">
            <Toggle2 value={dhPower} onChange={setDhPower} />
          </Field>
          {dhPower && (
            <>
              <Field label="模式">
                <Dropdown ariaLabel="排程除濕模式" className="w-full" options={dhOptions.modes} value={dhMode || undefined} onSelect={setDhMode} />
              </Field>
              <Field label="目標濕度">
                <Dropdown
                  ariaLabel="排程目標濕度" className="w-full"
                  options={dhOptions.humidity.map((h) => ({ value: h, label: `${h}%` }))}
                  value={dhHumidity}
                  onSelect={setDhHumidity}
                />
              </Field>
            </>
          )}
        </div>
      )}

      {selectedType === "IR" && selectedDeviceData && irButtons.length > 0 && (
        <div className="space-y-3">
          <Field label="按鈕">
            <Dropdown
              ariaLabel="排程電扇按鈕" className="w-full"
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
              aria-label="排程日期"
              value={triggerDate}
              onChange={(e) => setTriggerDate(e.target.value)}
              className="block h-[38px] min-w-0 w-full max-w-full appearance-none rounded-full border border-line/70 bg-elevated px-3 text-base text-soft"
            />
          </Field>
          <Field label="時間 *">
            <input
              type="time"
              aria-label="排程時間"
              value={triggerTime}
              onChange={(e) => setTriggerTime(e.target.value)}
              className="block h-[38px] min-w-0 w-full max-w-full appearance-none rounded-full border border-line/70 bg-elevated px-3 text-base text-soft"
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
          className="h-[38px] min-w-0 flex-1 rounded-full bg-cool px-3 text-[13px] font-medium text-white hover:bg-cool/85 disabled:bg-elevated disabled:text-mute transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-[38px] shrink-0 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-soft hover:bg-elevated transition-colors"
        >
          取消
        </button>
      </div>
    </fieldset>
  );
}
