"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, ArrowUpRight, Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DeviceTiles } from "@/components/devices/device-tiles";
import type { DevicesPage, History } from "@/lib/api";
import type { UiDevice } from "@/lib/devices";

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

/** 首頁「常用設備」：釘選的設備，與裝置頁同一套方塊（DeviceTiles），點了在同一排下面展開控制。 */
export function DeviceQuickControl({ devices, page, onChanged, history = null, allDevices, onExpandedChange, waiting = false }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function select(next: string | null) {
    setExpanded(next);
    onExpandedChange?.(next !== null);
  }

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

  return (
    <section aria-label="常用設備">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-soft">常用設備 <span className="num ml-1 text-xs font-normal text-mute">{devices.length}</span></h2>
        <Link href="/devices" className="flex min-h-11 items-center gap-1 text-xs font-medium text-cool hover:text-cool/80">
          全部裝置 <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <DeviceTiles devices={devices} page={page} onChanged={onChanged} history={history} allDevices={allDevices}
        waiting={waiting} expanded={expanded} onSelect={select} />
    </section>
  );
}
