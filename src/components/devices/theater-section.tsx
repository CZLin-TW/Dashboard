"use client";

import { Clapperboard, RefreshCw } from "lucide-react";
import {
  type TheaterFlagKey,
  type TheaterSummary,
  THEATER_AVR_STATE_LABELS,
  THEATER_FLAG_LABELS,
  THEATER_TV_STATE_LABELS,
} from "@/lib/theater";

// PC 卡片底部的「劇院 agent」區塊。只有 hostname 對上 theater summary agent_id
// 的那張卡會收到 summary（目前 = XEON-1230V2）。資料流：
//   Dashboard /api/theater/* → home-butler → PC agent WebSocket → theater_agent.py :8080

interface Props {
  summary: TheaterSummary;
  /** summary 拉取失敗（agent 離線 / Render 冷啟動逾時）。顯示上次成功資料 + 灰標 + 開關鎖定 */
  offline: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onFlagChange: (key: TheaterFlagKey, value: boolean) => void;
}

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
        checked ? "bg-fresh" : "bg-elevated"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function LogBlock({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="space-y-1">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">
        {label}
      </p>
      {/* 固定高度 + 可捲動：agent 端把尾端行數從 8 拉到 15（8 行會被 [MONITOR] 洗掉），
          不限高的話卡片會被兩塊 log 撐得很長 */}
      <div className="max-h-32 overflow-y-auto rounded-[10px] bg-elevated/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-mute">
        {lines.length === 0 ? (
          <p>（尚無 log）</p>
        ) : (
          lines.map((line, i) => (
            <p key={i} className="truncate" title={line}>
              {line}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

const FLAG_KEYS: TheaterFlagKey[] = ["kef_link", "tv_screen_auto", "tv_avr_sync"];

// agent 的狀態機看到的電視 / AVR 狀態，加上「實際跑著的」agent 版本。
// agent_sha 特別重要：agent 曾經卡在兩個月前的版本沒人發現（auto-update 靜默失效），
// 那次如果版本有顯示在畫面上就會早早被抓到——這一列就是為了那件事而加的。
function StatusRow({ monitor }: { monitor?: TheaterSummary["monitor"] }) {
  const items = [
    { label: "電視", value: THEATER_TV_STATE_LABELS[monitor?.last_tv_state ?? ""] ?? "未知" },
    { label: "AVR", value: THEATER_AVR_STATE_LABELS[monitor?.last_avr_state ?? ""] ?? "未知" },
    { label: "版本", value: monitor?.agent_sha || "未知", mono: true },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ label, value, mono }) => (
        <div key={label} className="rounded-[10px] bg-elevated/40 px-2.5 py-1.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-mute">
            {label}
          </p>
          <p className={`truncate text-[13px] text-foreground ${mono ? "font-mono" : ""}`} title={value}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function TheaterSection({ summary, offline, refreshing, onRefresh, onFlagChange }: Props) {
  return (
    <div className="space-y-2.5 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 px-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-mute">
          <Clapperboard className="h-4 w-4" strokeWidth={1.8} />
          劇院 Agent
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${
              offline ? "bg-mute/20 text-mute" : "bg-fresh/15 text-fresh"
            }`}
          >
            {offline ? "離線" : "在線"}
          </span>
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="grid h-7 w-7 place-items-center rounded-[8px] text-mute transition-colors hover:bg-elevated/60 hover:text-foreground disabled:opacity-40"
          title="重新整理"
          aria-label="重新整理"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
        </button>
      </div>

      <StatusRow monitor={summary.monitor} />

      <div className="space-y-2">
        {FLAG_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 rounded-[12px] bg-elevated/40 px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block text-[13px] text-foreground">
                {THEATER_FLAG_LABELS[key].title}
              </span>
              <span className="block text-[11.5px] text-mute">
                {THEATER_FLAG_LABELS[key].description}
              </span>
            </span>
            <Toggle
              checked={!!summary.flags?.[key]}
              disabled={offline}
              label={THEATER_FLAG_LABELS[key].title}
              onChange={(value) => onFlagChange(key, value)}
            />
          </div>
        ))}
      </div>

      <LogBlock label="agent.log" lines={summary.logs?.theater ?? []} />
      <LogBlock label="appletv_monitor.log" lines={summary.logs?.appletv ?? []} />
    </div>
  );
}
