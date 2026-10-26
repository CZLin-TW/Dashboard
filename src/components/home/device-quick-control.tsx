"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { LayoutGrid, ChevronUp, ChevronDown, ArrowUpRight, Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PANEL_BASE } from "@/components/ui/device-controls";
import { DeviceController } from "@/components/ui/device-controller";
import { ScheduleSection } from "@/components/devices/schedule-section";
import type { DevicesPage, History } from "@/lib/api";
import { KIND_ICON, KIND_LABEL, type UiDevice } from "@/lib/devices";
import { schedulesFor } from "@/lib/schedule";

interface Props {
  /** 首頁釘選的可控制裝置（感應器除外）。 */
  devices: UiDevice[];
  page: DevicesPage | null;
  /** 任何指令或設定改變後呼叫，父層重讀裝置頁。 */
  onChanged: () => Promise<void> | void;
  history?: History | null;
  allDevices: UiDevice[];
  onExpandedChange?: (expanded: boolean) => void;
  /** Showing the last saved copy while a fresh one is read (see ScheduleSection). */
  waiting?: boolean;
}

/**
 * 首頁裝置快捷卡：每台釘選裝置一個 icon button，展開後在同一 row 內顯示控制面板。
 * 為什麼 expanded panel 要嵌進 grid 而不是浮層：保留視覺脈絡（哪個 button 對應哪個面板）。
 *
 * Panel 內部用共用的 <DeviceController />，跟裝置頁同一份控制邏輯。
 *
 * 已知 trade-off：tile 收合時 DeviceController unmount，AC pending 草稿
 * 會清空。實際 UX：使用者「展開 → 改 → 收合 → 再展開」會看到原本草稿
 * 消失。可接受（draft 跨 collapse 持久不是必要功能）。
 */
export function DeviceQuickControl({ devices, page, onChanged, history = null, allDevices, onExpandedChange, waiting = false }: Props) {
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  // 實際渲染面板的設備。切換到另一台時先設 null 讓舊面板收合，
  // 收合動畫結束（onExitComplete）再換成新設備展開，呈現「收起 → 展開」的換過去感。
  const [shownDevice, setShownDevice] = useState<string | null>(null);
  const expandedRef = useRef<string | null>(null);
  const reduceMotion = useReducedMotion();

  function selectDevice(next: string | null) {
    expandedRef.current = next;
    setExpandedDevice(next);
    setShownDevice((cur) => (cur === null || next === null ? next : cur === next ? cur : null));
    onExpandedChange?.(next !== null);
  }

  function toggleExpand(name: string) {
    selectDevice(expandedDevice === name ? null : name);
  }

  function renderPanel(device: UiDevice) {
    const Icon = KIND_ICON[device.kind];
    return (
      <div className={PANEL_BASE}>
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-4 w-4 place-items-center text-mute">
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{device.name}</span>
            {device.location && (
              <span className="text-xs text-mute">{device.location}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => selectDevice(null)}
            className="flex min-h-9 items-center gap-1 rounded-full bg-elevated px-3 text-xs text-mute hover:text-soft"
          >
            收合
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        {page && <DeviceController device={device} page={page} onChanged={onChanged} history={history} />}
        {page && (
          <ScheduleSection device={device} page={page} schedules={schedulesFor(page, device.name)} allDevices={allDevices}
            onSchedulesChange={() => void onChanged()} autoOff={page.auto_off.find((a) => a.name === device.name)} waiting={waiting} />
        )}
      </div>
    );
  }

  // ─── 主渲染 ───
  if (devices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <LayoutGrid className="h-4 w-4" strokeWidth={2} />
            裝置快捷
          </CardTitle>
          <Link href="/devices" className="text-sm text-cool hover:text-cool/80">
            查看全部 →
          </Link>
        </CardHeader>
        <p className="flex items-center gap-1 text-sm text-mute">
          請到
          <Link href="/devices" className="text-cool hover:text-cool/80 mx-1">裝置頁</Link>
          <Pin className="h-3.5 w-3.5" strokeWidth={2} />
          釘選裝置
        </p>
      </Card>
    );
  }

  const expandedDev = shownDevice ? devices.find((d) => d.name === shownDevice) : null;

  function renderTile(device: UiDevice) {
    const isActive = expandedDevice === device.name;
    const Icon = KIND_ICON[device.kind];
    let isRunning = false;
    let status = "紅外線";
    let readout = "遙控器";
    let detail = "點擊操作";
    if (device.kind === "ac") {
      const ac = device.ac;
      isRunning = ac.power === "on";
      status = ac.power === null ? "待更新" : isRunning ? "開啟中" : "已關閉";
      readout = ac.power === null ? "—" : !isRunning ? "關閉" : `${ac.temperature ?? "—"}°`;
      detail = ac.power === null ? "等待裝置狀態" : `HA 狀態 · ${ac.mode || "空調"}`;
    } else if (device.kind === "dehumidifier") {
      const d = device.dehumidifier;
      isRunning = d.status.power === true;
      status = d.status.power === null ? "待更新" : isRunning ? "運轉中" : "已關閉";
      const humidity = d.sensor_humidity;
      const target = d.rule.auto_mode ? `${d.rule.effective_threshold}%` : d.status.target;
      readout = humidity != null ? `${Math.round(humidity)}%` : target || "—";
      detail = humidity != null ? `目前濕度 · ${d.rule.auto_mode ? `自動 ${target}` : "手動"}` : `目標濕度 · ${d.rule.auto_mode ? "自動" : "手動"}`;
    } else if (device.kind === "ir") {
      detail = `${device.ir.buttons.length} 個按鈕 · 點擊操作`;
    }
    return (
      <motion.button
        key={device.name}
        type="button"
        onClick={() => toggleExpand(device.name)}
        aria-expanded={isActive}
        whileTap={reduceMotion ? undefined : { scale: 0.985 }}
        whileHover={reduceMotion ? undefined : { y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`group relative flex min-w-0 flex-col rounded-[24px] border p-4 text-left transition-colors duration-200 md:p-5 ${
          isActive
            ? "border-cool/50 bg-cool-bg shadow-[0_0_0_1px_var(--color-cool)]"
            : "border-line/80 bg-surface shadow-[0_3px_16px_-8px_rgba(31,36,43,0.12)] hover:border-cool/30"
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${isRunning ? "bg-fresh-bg text-fresh" : "bg-elevated text-mute"}`}><Icon className="h-5 w-5" strokeWidth={1.6} /></span>
          <span className={`flex items-center gap-1.5 text-[10px] font-medium md:text-xs ${isRunning ? "text-fresh" : "text-mute"}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isRunning ? "bg-fresh" : "bg-faint"}`} />{status}</span>
        </span>
        <span className="mt-4 truncate text-[15px] font-semibold text-soft" title={device.name}>{device.name}</span>
        <span className="mt-0.5 text-[11px] text-mute">{device.location || KIND_LABEL[device.kind]}</span>
        <span className={`mt-4 font-semibold tracking-tight text-foreground ${device.kind === "ir" ? "text-[24px] leading-[38px]" : "num text-[32px] leading-[38px]"}`}>{readout}</span>
        <span className="mt-2 flex items-center justify-between gap-2 text-[11px] leading-relaxed text-mute"><span>{detail}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 text-cool transition-transform ${isActive ? "rotate-180" : ""}`} /></span>
      </motion.button>
    );
  }

  // Panel 必須跟「展開設備那一 row」相鄰才有正確視覺脈絡。
  // 但 mobile（2 欄）跟 desktop（4 欄）的 row 拆法不同 → 兩套各自渲染。
  // panel 放在每組 row 的後面（grid 外），避免 CSS grid `gap` 在 height: 0 ↔ unmount 時造成 12px snap。
  function renderRows(cols: 2 | 4, viewportClass: string) {
    const rows: UiDevice[][] = [];
    for (let i = 0; i < devices.length; i += cols) rows.push(devices.slice(i, i + cols));
    const gridCols = cols === 2 ? "grid-cols-2" : "grid-cols-4";
    return (
      <div className={`${viewportClass} space-y-3`}>
        {rows.map((row, rowIdx) => {
          const rowHasExpanded = !!expandedDev && row.some((d) => d.name === expandedDev.name);
          return (
            <div key={rowIdx}>
              <div className={`grid ${gridCols} gap-3`}>{row.map(renderTile)}</div>
              <AnimatePresence initial={false} onExitComplete={() => setShownDevice(expandedRef.current)}>
                {rowHasExpanded && expandedDev && (
                  <motion.div
                    key="panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      height: { duration: reduceMotion ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] },
                      opacity: { duration: reduceMotion ? 0 : 0.18, ease: "easeOut" },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3">{renderPanel(expandedDev)}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section aria-label="常用設備">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-soft">常用設備 <span className="num ml-1 text-xs font-normal text-mute">{devices.length}</span></h2>
        <Link href="/devices" className="flex min-h-11 items-center gap-1 text-xs font-medium text-cool hover:text-cool/80">
          全部裝置 <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {renderRows(2, "sm:hidden")}
      {renderRows(4, "hidden sm:block")}
    </section>
  );
}
