"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { PANEL_BASE } from "@/components/ui/device-controls";
import { DeviceController } from "@/components/ui/device-controller";
import { ScheduleSection } from "@/components/devices/schedule-section";
import { CompactTile, PanelHeader, TileBadge, TileGrid, type TileTone } from "@/components/ui/tile-grid";
import type { DevicesPage, History } from "@/lib/api";
import { KIND_ICON, type UiDevice } from "@/lib/devices";
import { isAttention, schedulesFor } from "@/lib/schedule";

// ─────────────────────────────────────────────────────────────
// 設備方塊（比照 Apple 家庭的小方塊）：點了才在那一排下面展開完整控制。首頁「常用設備」與裝置頁各房間共用。
// 展開哪一台由呼叫端決定（裝置頁跨房間只展開一台）。
// 已知 trade-off：收合時 DeviceController 卸載，冷氣未送出的調整會清掉。
// ─────────────────────────────────────────────────────────────

interface Props {
  devices: UiDevice[];
  page: DevicesPage | null;
  /** 任何指令或設定改變後呼叫，父層重讀裝置頁。 */
  onChanged: () => Promise<void> | void;
  history?: History | null;
  allDevices: UiDevice[];
  /** Showing the last saved copy while a fresh one is read (see ScheduleSection). */
  waiting?: boolean;
  /** The device whose controls are open (may be in another group), or null. */
  expanded: string | null;
  onSelect: (name: string | null) => void;
  /** Extra buttons in the open panel's header (the devices page puts the pin there). */
  panelActions?: (device: UiDevice) => ReactNode;
}

export function DeviceTiles({ devices, page, onChanged, history = null, allDevices, waiting = false, expanded, onSelect,
  panelActions }: Props) {

  function renderPanel(device: UiDevice) {
    const state = compactState(device);
    return (
      <div className={PANEL_BASE}>
        <PanelHeader icon={KIND_ICON[device.kind]} tone={state.tone} title={device.name} value={state.value} text={state.text}
          actions={panelActions?.(device)} onClose={() => onSelect(null)} />
        {page && <DeviceController device={device} page={page} onChanged={onChanged} history={history} />}
        {page && (
          <ScheduleSection device={device} page={page} schedules={schedulesFor(page, device.name)} allDevices={allDevices}
            onSchedulesChange={() => void onChanged()} autoOff={page.auto_off.find((a) => a.name === device.name)} waiting={waiting} />
        )}
      </div>
    );
  }

  function renderTile(device: UiDevice, active: boolean) {
    const schedules = page ? schedulesFor(page, device.name) : [];
    const attention = schedules.filter(isAttention).length;
    const nextAt = schedules.find((s) => !isAttention(s))?.due_local.slice(11) ?? null;
    const state = compactState(device);
    return (
      <CompactTile icon={KIND_ICON[device.kind]} tone={state.tone} lit={state.running} title={device.name} value={state.value} text={state.text}
        onClick={() => onSelect(active ? null : device.name)} active={active} dataKey={device.name}
        badge={attention ? <TileBadge icon={AlertTriangle} alert /> : nextAt ? <TileBadge icon={Clock} alert={false} /> : null}
        note={attention ? <span className="text-warm">排程待確認</span> : nextAt ? <span className="num text-amber">{nextAt} 排程</span> : null} />
    );
  }

  return (
    <TileGrid items={devices} keyOf={(d) => d.name} expanded={expanded} renderTile={renderTile} renderPanel={renderPanel} />
  );
}

/** The tile's state: a short reading (bold) and words; running devices light up. */
function compactState(device: UiDevice): { value: string | null; text: string; running: boolean; tone: TileTone } {
  if (device.kind === "ac") {
    const ac = device.ac;
    if (!ac.available || ac.power === null) return { value: null, text: "狀態未知", running: false, tone: "unknown" };
    if (ac.power !== "on") return { value: null, text: "關閉", running: false, tone: "off" };
    return { value: ac.temperature != null ? `${ac.temperature}°` : null, text: [ac.mode, ac.fan].filter(Boolean).join(" · "), running: true, tone: "cool" };
  }
  if (device.kind === "dehumidifier") {
    const d = device.dehumidifier;
    if (d.status.power === null) return { value: null, text: "狀態未知", running: false, tone: "unknown" };
    const humidity = d.sensor_humidity != null ? `${Math.round(d.sensor_humidity)}%` : null;
    const mode = d.rule.auto_mode ? "自動" : d.status.power ? "運轉中" : "關閉";
    return { value: humidity, text: humidity ? `· ${mode}` : mode, running: d.status.power, tone: d.status.power ? "teal" : "off" };
  }
  if (device.kind === "ir") return { value: null, text: `遙控器 · ${device.ir.buttons.length} 鍵`, running: false, tone: "off" };
  return { value: null, text: "", running: false, tone: "off" };
}
