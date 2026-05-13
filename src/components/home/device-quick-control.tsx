"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { LayoutGrid, ChevronUp, Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PANEL_BASE } from "@/components/ui/device-controls";
import { DeviceController } from "@/components/ui/device-controller";
import {
  type DeviceData,
  type DeviceOptions,
  type DehumidifierAutoRule,
  DEVICE_ICONS,
  DEVICE_ICON_FALLBACK,
} from "@/lib/types";
import type { Sensor } from "@/lib/sensor";
import type { DehumDevice } from "@/lib/dehumidifier";

// Tile active 狀態用單一 cool 色，跟 Segment active / link / scroll-target ring
// 一樣的「被選中」語義；不依 device type 換色——icon 形狀本身就足夠辨識類型，
// 而且 IR=warm 紅、除濕=fresh 綠 在這套 palette 的其他語義（OFF/ON）會混淆。

interface Props {
  /** 已釘選且要顯示的可控設備（不含感應器）。順序依釘選順序。 */
  devices: DeviceData[];
  options: DeviceOptions;
  /** AC 指令送出且輪詢確認後呼叫，由父層 refetch dashboard。 */
  onAcCommandSent: () => Promise<void> | void;
  /** 除濕機指令送出且輪詢確認後呼叫，由父層 refetch /api/devices/status。 */
  onDehumidifierCommandSent: () => Promise<void> | void;
  /** 除濕機自動規則 map（key=device_name），給展開後的 controller 用。 */
  dehumRulesMap?: Record<string, DehumidifierAutoRule>;
  /** 可選的感測器名稱清單，給自動規則下拉用。 */
  availableSensors?: string[];
  /** 自動規則異動後呼叫，由父層 refetch /api/dehumidifier/auto-rule。 */
  onDehumRuleUpdate?: () => Promise<void> | void;
  /** 感測器 map（含歷史），給自動模式 chart 撈綁定 sensor 24h 濕度用。 */
  sensorsMap?: Record<string, Sensor>;
  /** 除濕機 power 歷史 map，給自動模式 chart 背景畫綠色 on-segments 用。 */
  dehumHistoryMap?: Record<string, DehumDevice>;
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
export function DeviceQuickControl({
  devices,
  options,
  onAcCommandSent,
  onDehumidifierCommandSent,
  dehumRulesMap,
  availableSensors,
  onDehumRuleUpdate,
  sensorsMap,
  dehumHistoryMap,
}: Props) {
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  function toggleExpand(name: string) {
    setExpandedDevice((prev) => (prev === name ? null : name));
  }

  function renderPanel(device: DeviceData) {
    const Icon = DEVICE_ICONS[device.type] ?? DEVICE_ICON_FALLBACK;
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
            onClick={() => setExpandedDevice(null)}
            className="flex items-center gap-1 rounded-full border border-line bg-elevated px-2.5 py-1 text-xs text-mute hover:text-soft"
          >
            收合
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <DeviceController
          device={device}
          options={options}
          onAcCommandSuccess={onAcCommandSent}
          onDehumidifierCommandSuccess={onDehumidifierCommandSent}
          dehumRule={device.type === "除濕機" ? (dehumRulesMap?.[device.name] ?? null) : undefined}
          availableSensors={device.type === "除濕機" ? availableSensors : undefined}
          onDehumRuleUpdate={onDehumRuleUpdate}
          sensorsMap={device.type === "除濕機" ? sensorsMap : undefined}
          dehumHistoryMap={device.type === "除濕機" ? dehumHistoryMap : undefined}
        />
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

  const expandedDev = expandedDevice ? devices.find((d) => d.name === expandedDevice) : null;

  function renderTile(device: DeviceData) {
    const isRunning =
      (device.type === "空調" && device.lastPower === "on") ||
      (device.type === "除濕機" && device.power === true);
    const isActive = expandedDevice === device.name;
    const Icon = DEVICE_ICONS[device.type] ?? DEVICE_ICON_FALLBACK;
    return (
      <motion.button
        key={device.name}
        onClick={() => toggleExpand(device.name)}
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`relative flex flex-col items-center gap-2 rounded-2xl border p-4 shadow-sm shadow-mute/5 transition-colors duration-200 ${
          isActive
            ? "border-cool/40 bg-cool-bg"
            : "border-line bg-surface hover:bg-elevated"
        }`}
      >
        {isRunning && (
          <span aria-label="運作中" className="absolute top-2 left-2 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
          </span>
        )}
        <Icon className={`h-7 w-7 ${isActive ? "text-cool" : "text-mute"}`} strokeWidth={1.75} />
        <span className="text-sm font-medium">{device.name}</span>
        {device.location && <span className="text-xs text-mute">{device.location}</span>}
      </motion.button>
    );
  }

  // Panel 必須跟「展開設備那一 row」相鄰才有正確視覺脈絡。
  // 但 mobile（2 欄）跟 desktop（4 欄）的 row 拆法不同 → 兩套各自渲染。
  // panel 放在每組 row 的後面（grid 外），避免 CSS grid `gap` 在 height: 0 ↔ unmount 時造成 12px snap。
  function renderRows(cols: 2 | 4, viewportClass: string) {
    const rows: DeviceData[][] = [];
    for (let i = 0; i < devices.length; i += cols) rows.push(devices.slice(i, i + cols));
    const gridCols = cols === 2 ? "grid-cols-2" : "grid-cols-4";
    return (
      <div className={`${viewportClass} space-y-3`}>
        {rows.map((row, rowIdx) => {
          const rowHasExpanded = !!expandedDev && row.some((d) => d.name === expandedDev.name);
          return (
            <div key={rowIdx}>
              <div className={`grid ${gridCols} gap-3`}>{row.map(renderTile)}</div>
              <AnimatePresence initial={false}>
                {rowHasExpanded && expandedDev && (
                  <motion.div
                    key="panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      height: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
                      opacity: { duration: 0.18, ease: "easeOut" },
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
      {renderRows(2, "sm:hidden")}
      {renderRows(4, "hidden sm:block")}
    </Card>
  );
}
