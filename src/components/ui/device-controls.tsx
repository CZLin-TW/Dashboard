"use client";

import { Pin } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// 裝置控制 UI 元件 — devices 頁、首頁裝置快捷、排程頁共用。
// 目的是 visual & 行為一致：尺寸、圓角、配色都統一
// （Toggle2 ON=fresh / OFF=warm、Segment active=cool、Pin pinned=pin 紫等）。
// 所有元件假設外層已給好 layout（Field 包覆等）。
// ─────────────────────────────────────────────────────────────

/** Field label（小字、mute 色、輕微字距）。 */
export const FIELD_LABEL = "text-[12px] font-medium text-mute tracking-[0.04em]";

/** 設備 panel 容器 className：圓角 14px、surface 底、預設 column flex + gap。 */
export const PANEL_BASE =
  "rounded-[14px] border border-line bg-surface p-3.5 shadow-sm shadow-mute/5 flex flex-col gap-3.5";

/** ON/OFF 二段式 pill 開關。on=fresh 綠、off=warm 紅。
 *  外層 rounded-[19px] / 內按鈕 rounded-full / padding 3px → 同心圓弧。 */
export function Toggle2({
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
export function Stepper({
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

/** Segment pill 群組（多選一）。active=cool 藍底白字。
 *  支援 pendingValue（amber 閃爍）、failedValue（warm 閃爍），
 *  讓除濕機那種非同步等待回饋的場景可以重用。 */
export function Segment<T extends string | number>({
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
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className={FIELD_LABEL}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** 圓形 pin button（panel 右上）。pinned=pin 紫底白字、disabled=灰、未釘=elevated 灰底。 */
export function PinButton({
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

/** 小狀態圓點 + 文字（panel 內顯示「目前運轉中 / 關閉 / 送出中」）。 */
export function StatusLine({
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

/** 大字溫度 + 中點 + 濕度的 readout 排版。
 *  devices 頁的感應器卡、首頁室內感應器卡、首頁天氣卡都用這個。
 *  `temp` / `humidity` 接 number | null | undefined（缺值顯示「--」）。 */
export function ClimateReadout({
  temp,
  humidity,
  size = "lg",
}: {
  temp: number | string | null | undefined;
  humidity: number | string | null | undefined;
  /** lg 給首頁主卡、md 給裝置頁感應器卡裡面 */
  size?: "lg" | "md";
}) {
  const tempCls =
    size === "lg"
      ? "num text-[32px] font-bold tracking-[-0.025em] leading-none text-foreground"
      : "num text-[28px] font-bold tracking-[-0.02em] leading-none text-foreground";
  const humCls =
    size === "lg"
      ? "num text-xl font-semibold text-soft"
      : "num text-lg font-semibold text-soft";
  const tempUnitCls =
    size === "lg"
      ? "ml-[2px] text-lg font-semibold text-mute"
      : "ml-[2px] text-base font-semibold text-mute";
  const humUnitCls =
    size === "lg"
      ? "ml-[1px] text-sm font-medium text-mute"
      : "ml-[1px] text-xs font-medium text-mute";
  return (
    <div className="flex items-baseline gap-3">
      <span className={tempCls}>
        {temp ?? "--"}
        <span className={tempUnitCls}>°C</span>
      </span>
      <span className="text-mute">·</span>
      <span className={humCls}>
        {humidity ?? "--"}
        <span className={humUnitCls}>%</span>
      </span>
    </div>
  );
}
