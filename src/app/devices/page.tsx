"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Activity, Pin } from "lucide-react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { usePinnedDevices } from "@/hooks/use-pinned-devices";
import {
  AcPendingState,
  DeviceData,
  DeviceOptions,
  DEFAULT_OPTIONS,
  DEVICE_ICONS,
  DEVICE_ICON_FALLBACK,
  acPendingFromDevice,
} from "@/components/home/types";

// ─────────────────────────────────────────────────────────────
// 視覺對照 HTML reference：toggle2 / stepper / segment / panel
// 業務邏輯（pending/dirty/awaiting、AC/DH 輪詢、IR）保留不動。
// ─────────────────────────────────────────────────────────────

function DeviceScrollTarget({ deviceRefs }: { deviceRefs: React.RefObject<Record<string, HTMLDivElement | null>> }) {
  const searchParams = useSearchParams();
  const targetDevice = searchParams.get("target");

  useEffect(() => {
    if (targetDevice && deviceRefs.current?.[targetDevice]) {
      deviceRefs.current[targetDevice]?.scrollIntoView({ behavior: "smooth", block: "center" });
      const el = deviceRefs.current[targetDevice];
      if (el) {
        el.classList.add("ring-2", "ring-cool");
        setTimeout(() => el.classList.remove("ring-2", "ring-cool"), 2000);
      }
    }
  }, [targetDevice, deviceRefs]);

  return null;
}

interface DashboardPayload {
  devices: DeviceData[];
  options: DeviceOptions;
}

// ─── 視覺單元（沒抽成 component，只用一致的 className 寫法）───
const FIELD_LABEL = "text-[12px] font-medium text-mute tracking-[0.04em]";
const PANEL_BASE =
  "rounded-[14px] border border-line bg-surface p-3.5 shadow-sm shadow-mute/5 flex flex-col gap-3.5";

/** ON/OFF 二段式 pill 開關。on=fresh 綠、off=warm 紅。 */
function Toggle2({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[19px] border border-line bg-elevated p-[3px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
          value ? "bg-fresh text-white shadow-sm" : "text-mute"
        }`}
      >
        ON
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(false)}
        className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
          !value ? "bg-warm text-white shadow-sm" : "text-mute"
        }`}
      >
        OFF
      </button>
    </div>
  );
}

/** 圓形 +/− stepper，中央顯示大字數值。 */
function Stepper({
  value,
  onMinus,
  onPlus,
  unit = "°C",
}: {
  value: number;
  onMinus: () => void;
  onPlus: () => void;
  unit?: string;
}) {
  return (
    <div className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={onMinus}
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-lg text-soft hover:bg-elevated"
        aria-label="減少"
      >
        −
      </button>
      <span className="num min-w-[64px] text-center text-[22px] font-bold tracking-[-0.02em]">
        {value}
        <span className="ml-[2px] text-[13px] font-semibold text-mute">{unit}</span>
      </span>
      <button
        type="button"
        onClick={onPlus}
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-lg text-soft hover:bg-elevated"
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}

/** Segment pill 群組（多選一）。active=accent 藍底白字。 */
function Segment<T extends string | number>({
  options,
  value,
  onSelect,
  pendingValue,
  failedValue,
  disabled,
  format,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onSelect: (v: T) => void;
  pendingValue?: T;
  failedValue?: T;
  disabled?: boolean;
  format?: (v: T) => string;
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-[19px] border border-line bg-elevated p-[3px]">
      {options.map((opt) => {
        const isActive = opt.value === value;
        const isPending = pendingValue !== undefined && opt.value === pendingValue;
        const isFailed = failedValue !== undefined && opt.value === failedValue;
        const cls = isFailed
          ? "bg-warm text-white animate-pulse"
          : isPending
          ? "bg-amber-500 text-white animate-pulse"
          : isActive
          ? "bg-cool text-white shadow-sm"
          : "text-soft hover:text-foreground";
        return (
          <button
            key={String(opt.value)}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.value)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${cls}`}
          >
            {format ? format(opt.value) : opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** field 區塊：label 在上、控制元件在下。 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={FIELD_LABEL}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** 圓形 pin button（panel 右上）。is-pinned 時 cool 底白字。 */
function PinButton({
  pinned,
  disabled,
  onClick,
  title,
}: {
  pinned: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${
        pinned
          ? "bg-pin text-white"
          : disabled
          ? "bg-elevated text-faint cursor-not-allowed"
          : "bg-elevated text-mute hover:text-soft"
      }`}
    >
      <Pin className="h-3.5 w-3.5" strokeWidth={2} fill={pinned ? "currentColor" : "none"} />
    </button>
  );
}

/** 小狀態圓點 + 文字（panel 內顯示「目前運轉中 / 關閉」）。 */
function StatusLine({
  tone,
  text,
  time,
}: {
  tone: "running" | "waiting" | "off";
  text: string;
  time?: string;
}) {
  const dot =
    tone === "running"
      ? "bg-fresh"
      : tone === "waiting"
      ? "bg-amber-500 animate-pulse"
      : "bg-mute/40";
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-mute">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-soft">{text}</span>
      {time && <span className="num text-mute">· {time}</span>}
    </div>
  );
}

export default function DevicesPage() {
  const { data: dashboard, loading, refetch: fetchDevices } = useCachedFetch<DashboardPayload | null>("/api/dashboard", null);
  const { data: liveStatus, refetch: refetchStatus } = useCachedFetch<Record<string, Partial<DeviceData>>>("/api/devices/status", {});
  const rawDevices = dashboard?.devices ?? [];
  const options = dashboard?.options ?? DEFAULT_OPTIONS;
  const devices = rawDevices.map(d => ({ ...d, ...(liveStatus[d.name] ?? {}) }));
  const pin = usePinnedDevices();

  const [dhPending, setDhPending] = useState<{ type: string; value: unknown } | null>(null);
  const [dhFailed, setDhFailed] = useState<{ type: string; value: unknown } | null>(null);
  const deviceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [acPendingMap, setAcPendingMap] = useState<Record<string, AcPendingState>>({});
  const [acFailedMap, setAcFailedMap] = useState<Record<string, boolean>>({});
  const [acWaitingMap, setAcWaitingMap] = useState<Record<string, boolean>>({});
  const [acSendingMap, setAcSendingMap] = useState<Record<string, boolean>>({});

  function getAcPending(device: DeviceData): AcPendingState {
    return acPendingMap[device.name] ?? acPendingFromDevice(device);
  }

  /** pending 是否與 device 的 last* baseline 不同。
   *  電源狀態不同就算 dirty；都是 ON 才再比 temp/mode/fan；都是 OFF 時其他欄位無關。
   *  這樣 A→B→A 改回原值時會回到「未變更」狀態。 */
  function isAcDirty(device: DeviceData): boolean {
    const pending = getAcPending(device);
    const baseline = acPendingFromDevice(device);
    if (pending.power !== baseline.power) return true;
    if (!pending.power) return false;
    return (
      pending.temperature !== baseline.temperature ||
      pending.mode !== baseline.mode ||
      pending.fanSpeed !== baseline.fanSpeed
    );
  }

  function updateAcPending(device: DeviceData, updates: Partial<AcPendingState>) {
    setAcPendingMap((prev) => {
      const current = prev[device.name] ?? acPendingFromDevice(device);
      return { ...prev, [device.name]: { ...current, ...updates } };
    });
  }

  function flashAcFailed(deviceName: string) {
    setAcFailedMap((prev) => ({ ...prev, [deviceName]: true }));
    setTimeout(() => {
      setAcFailedMap((prev) => { const next = { ...prev }; delete next[deviceName]; return next; });
    }, 2000);
  }

  async function sendAcCommand(device: DeviceData) {
    const pending = getAcPending(device);
    setAcSendingMap((prev) => ({ ...prev, [device.name]: true }));
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: device.name, action: "setAll", params: pending }),
      });
      if (!res.ok) {
        console.error(`[sendAcCommand] ${device.name} failed: HTTP ${res.status}`);
        flashAcFailed(device.name);
        return;
      }
      setAcWaitingMap((prev) => ({ ...prev, [device.name]: true }));
      await fetchDevices();
      setAcPendingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
      setAcWaitingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
    } catch (err) {
      console.error(`[sendAcCommand] ${device.name} network error:`, err);
      flashAcFailed(device.name);
      setAcWaitingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
    } finally {
      setAcSendingMap((prev) => { const next = { ...prev }; delete next[device.name]; return next; });
    }
  }

  async function sendDehumidifierCommand(deviceName: string, params: Record<string, unknown>) {
    const expected: { type: string; value: unknown } =
      params.power !== undefined ? { type: "power", value: params.power } :
      params.mode !== undefined ? { type: "mode", value: params.mode } :
      { type: "humidity", value: params.humidity };

    setDhPending(expected);
    setDhFailed(null);

    try {
      await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, action: "dehumidifier", params }),
      });

      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch("/api/devices/status");
          const data = await res.json();
          const dh = data?.[deviceName];
          if (dh) {
            const matched =
              (expected.type === "power" && dh.power === expected.value) ||
              (expected.type === "mode" && dh.mode === expected.value) ||
              (expected.type === "humidity" && String(dh.targetHumidity) === `${expected.value}%`);
            if (matched) {
              setDhPending(null);
              refetchStatus();
              return;
            }
          }
        } catch { /* continue polling */ }
      }

      setDhPending(null);
      setDhFailed(expected);
      setTimeout(() => setDhFailed(null), 2000);
      refetchStatus();
    } catch {
      setDhPending(null);
    }
  }

  async function sendIrCommand(deviceName: string, button: string) {
    try {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName, action: "ir", params: { button } }),
      });
      if (!res.ok) {
        console.error(`[sendIrCommand] ${deviceName}/${button} failed: HTTP ${res.status}`);
        alert(`IR 指令失敗：${deviceName} - ${button}（HTTP ${res.status}）`);
      }
    } catch (err) {
      console.error(`[sendIrCommand] ${deviceName}/${button} network error:`, err);
      alert(`IR 指令網路錯誤：${deviceName} - ${button}`);
    }
  }

  const sensors = devices.filter(d => d.type === "感應器");
  const controllable = devices.filter(d => d.type !== "感應器");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense>
        <DeviceScrollTarget deviceRefs={deviceRefs} />
      </Suspense>

      {/* ── 環境感測 ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <Activity className="h-5 w-5 text-mute" strokeWidth={2} />
          環境感測
        </h1>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-mute">
            釘選 1 個到首頁{pin.pinnedSensor ? "（已選 1）" : "（未選）"}
          </p>
          {pin.pinnedSensor && (
            <button
              onClick={() => pin.setPinnedSensor(null)}
              className="text-xs text-warm hover:text-warm/80"
            >
              重置釘選
            </button>
          )}
        </div>

        {sensors.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((s) => {
              const pinned = pin.isSensorPinned(s.name);
              const SensorIcon = DEVICE_ICONS["感應器"] ?? DEVICE_ICON_FALLBACK;
              return (
                <div key={s.name} className={PANEL_BASE}>
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-4 w-4 place-items-center text-mute">
                        <SensorIcon className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {s.location || s.name}
                      </span>
                    </div>
                    <PinButton
                      pinned={pinned}
                      onClick={() => pin.setPinnedSensor(pinned ? null : s.name)}
                      title={pinned ? "已釘選至首頁" : "釘選至首頁"}
                    />
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="num text-[28px] font-bold tracking-[-0.02em] leading-none text-foreground">
                      {s.temperature ?? "--"}
                      <span className="ml-[2px] text-base font-semibold text-mute">°C</span>
                    </span>
                    <span className="text-mute">·</span>
                    <span className="num text-lg font-semibold text-soft">
                      {s.humidity ?? "--"}
                      <span className="ml-[1px] text-xs font-medium text-mute">%</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : loading ? (
          <p className="px-1 text-sm text-mute">載入中...</p>
        ) : (
          <p className="px-1 text-sm text-mute">未偵測到感測器</p>
        )}
      </section>

      {/* ── 裝置控制 ── */}
      <section className="space-y-3">
        <h1 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.01em]">
          <LayoutGrid className="h-5 w-5 text-mute" strokeWidth={2} />
          裝置控制
        </h1>
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-mute">
            釘選最多 {pin.MAX_PINNED_DEVICES} 個到首頁（已選 {pin.pinnedDevices.length}）
          </p>
          {pin.pinnedDevices.length > 0 && (
            <button
              onClick={pin.clearAllDevices}
              className="text-xs text-warm hover:text-warm/80"
            >
              重置釘選
            </button>
          )}
        </div>

      {/* 房間分群 + panel */}
      {(() => {
        const groups: Record<string, DeviceData[]> = {};
        controllable.forEach(d => {
          const loc = d.location || "其他";
          if (!groups[loc]) groups[loc] = [];
          groups[loc].push(d);
        });

        return Object.entries(groups).map(([location, devs]) => (
          <div key={location} className="space-y-3">
            <h2 className="px-1 pt-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-mute">
              {location}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {devs.map((device) => {
                const TypeIcon = DEVICE_ICONS[device.type] ?? DEVICE_ICON_FALLBACK;
                const pinned = pin.isDevicePinned(device.name);
                const canPin = pinned || pin.canPinMore;

                return (
                  <div
                    key={device.name}
                    ref={(el) => { deviceRefs.current[device.name] = el; }}
                    className={PANEL_BASE}
                  >
                    {/* panel-head */}
                    <div className="flex items-center justify-between gap-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid h-4 w-4 place-items-center text-mute">
                          <TypeIcon className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                        <span className="truncate text-sm font-semibold text-foreground">{device.name}</span>
                      </div>
                      <PinButton
                        pinned={pinned}
                        disabled={!canPin}
                        onClick={() => pin.togglePinDevice(device.name)}
                        title={pinned ? "已釘選至首頁" : canPin ? "釘選至首頁" : `已達上限 ${pin.MAX_PINNED_DEVICES} 個`}
                      />
                    </div>

                    {/* AC 控制 */}
                    {device.type === "空調" && (() => {
                      const pending = getAcPending(device);
                      const dirty = isAcDirty(device);
                      const failed = !!acFailedMap[device.name];
                      const waiting = !!acWaitingMap[device.name];
                      const sending = !!acSendingMap[device.name];
                      const lastTime = device.lastUpdatedAt
                        ? device.lastUpdatedAt.split(" ")[1] || device.lastUpdatedAt
                        : undefined;

                      return (
                        <>
                          {device.lastPower || waiting ? (
                            <StatusLine
                              tone={waiting ? "waiting" : device.lastPower === "on" ? "running" : "off"}
                              text={
                                waiting
                                  ? pending.power
                                    ? `送出中：${pending.temperature}°C ${pending.mode} ${pending.fanSpeed}`.trim()
                                    : "送出中：關閉"
                                  : device.lastPower === "on"
                                  ? `${device.lastTemperature ?? ""}°C ${device.lastMode ?? ""} ${device.lastFanSpeed ?? ""}`.trim()
                                  : "關閉"
                              }
                              time={lastTime}
                            />
                          ) : (
                            <p className="text-xs text-mute">尚無使用記錄</p>
                          )}

                          <Field label="電源">
                            <Toggle2 value={pending.power} onChange={(v) => updateAcPending(device, { power: v })} />
                          </Field>

                          <Field label="溫度">
                            <Stepper
                              value={pending.temperature}
                              onMinus={() => updateAcPending(device, { temperature: Math.max(options.ac.temperature.min, pending.temperature - 1) })}
                              onPlus={() => updateAcPending(device, { temperature: Math.min(options.ac.temperature.max, pending.temperature + 1) })}
                            />
                          </Field>

                          <Field label="模式">
                            <Segment
                              options={options.ac.modes}
                              value={pending.mode}
                              onSelect={(v) => updateAcPending(device, { mode: v })}
                            />
                          </Field>

                          <Field label="風速">
                            <Segment
                              options={options.ac.fan_speeds}
                              value={pending.fanSpeed}
                              onSelect={(v) => updateAcPending(device, { fanSpeed: v })}
                            />
                          </Field>

                          <button
                            type="button"
                            onClick={() => sendAcCommand(device)}
                            disabled={sending || waiting}
                            className={`w-full rounded-full border py-2.5 text-sm font-semibold transition-colors ${
                              failed
                                ? "border-transparent bg-warm text-white animate-pulse"
                                : waiting
                                ? "border-transparent bg-amber-500 text-white animate-pulse"
                                : dirty
                                ? "border-transparent bg-fresh text-white hover:bg-fresh/85"
                                : "border-dashed border-line-strong bg-elevated text-mute"
                            }`}
                          >
                            {failed
                              ? "失敗，請重試"
                              : sending
                              ? "送出中..."
                              : waiting
                              ? "確認中..."
                              : dirty
                              ? "送出設定"
                              : "未變更"}
                          </button>
                        </>
                      );
                    })()}

                    {/* 除濕機控制 */}
                    {device.type === "除濕機" && (
                      <>
                        {device.power !== undefined && (
                          <StatusLine
                            tone={device.power ? "running" : "off"}
                            text={
                              device.power
                                ? `運轉中${device.mode ? ` · ${device.mode}` : ""}${device.targetHumidity ? ` · 目標 ${device.targetHumidity}` : ""}`
                                : "關閉"
                            }
                          />
                        )}
                        <Field label="電源">
                          <Toggle2
                            value={!!device.power}
                            onChange={(v) => sendDehumidifierCommand(device.name, { power: v })}
                            disabled={dhPending !== null}
                          />
                        </Field>
                        <Field label="模式">
                          <Segment
                            options={options.dehumidifier.modes}
                            value={options.dehumidifier.modes.find(m => m.label === device.mode)?.value}
                            onSelect={(v) => sendDehumidifierCommand(device.name, { mode: v })}
                            pendingValue={dhPending?.type === "mode" ? (dhPending.value as string) : undefined}
                            failedValue={dhFailed?.type === "mode" ? (dhFailed.value as string) : undefined}
                            disabled={dhPending !== null}
                          />
                        </Field>
                        <Field label="目標濕度">
                          <Segment
                            options={options.dehumidifier.humidity.map(h => ({ value: h, label: `${h}%` }))}
                            value={(() => {
                              const t = String(device.targetHumidity ?? "").replace("%", "");
                              const n = parseInt(t, 10);
                              return Number.isFinite(n) ? n : undefined;
                            })()}
                            onSelect={(v) => sendDehumidifierCommand(device.name, { humidity: v })}
                            pendingValue={dhPending?.type === "humidity" ? (dhPending.value as number) : undefined}
                            failedValue={dhFailed?.type === "humidity" ? (dhFailed.value as number) : undefined}
                            disabled={dhPending !== null}
                          />
                        </Field>
                      </>
                    )}

                    {/* IR 控制 */}
                    {device.type === "IR" && (
                      <Field label="遙控按鈕">
                        <div className="flex flex-wrap gap-2">
                          {(device.buttons ?? "").split(",").map(b => b.trim()).filter(Boolean).map((btn) => (
                            <button
                              key={btn}
                              type="button"
                              onClick={() => sendIrCommand(device.name, btn)}
                              className="rounded-full border border-line bg-elevated px-3 py-1.5 text-sm font-medium text-soft hover:bg-mute/15 active:scale-[0.985] transition"
                            >
                              {btn}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-mute">IR 為單向發送，不會回傳裝置狀態</p>
                      </Field>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}
      </section>
    </div>
  );
}
