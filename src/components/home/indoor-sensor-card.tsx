"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronDown, Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClimateReadout } from "@/components/ui/device-controls";
import { type DeviceData, DEVICE_ICONS, DEVICE_ICON_FALLBACK } from "@/lib/types";
import type { Sensor } from "@/lib/sensor";
import type { AcSegment } from "@/lib/ac";
import type { DehumOnSegment } from "@/lib/dehumidifier";
import { SensorChart } from "@/components/devices/lazy-charts";

interface Props {
  sensor: DeviceData | null;
  /** 對應 sensor.name 的歷史資料（從 /api/sensors/status 拉到，page 層 lookup 後傳入）。
   *  null 時不顯示展開按鈕，純 readout。 */
  sensorHistory?: Sensor | null;
  tempDomain?: [number, number];
  humDomain?: [number, number];
  /** Meter Pro CO2 才有；null 不畫第三個 panel。 */
  co2Domain?: [number, number] | null;
  /** 該 sensor location 對應的 AC on 區段（page 層 lookup 後傳入）。 */
  acSegments?: AcSegment[];
  /** 該 sensor location 對應的除濕機 on 區段（斜紋背景）。 */
  dehumSegments?: DehumOnSegment[];
}

/**
 * 室內感應器卡：預設只顯示 ClimateReadout（不增加卡高），點擊展開向下顯示
 * 24h 折線圖。展開動畫沿用首頁 DeviceQuickControl 同 pattern（motion height auto）。
 *
 * 不放 PinButton——pin 操作集中在裝置頁，首頁只是展示已釘選的結果。
 */
export function IndoorSensorCard({ sensor, sensorHistory, tempDomain, humDomain, co2Domain, acSegments, dehumSegments }: Props) {
  const SensorIcon = DEVICE_ICONS["感應器"] ?? DEVICE_ICON_FALLBACK;
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const canExpand =
    !!(sensorHistory && tempDomain && humDomain && sensorHistory.history.length > 0);

  return (
    <>
    <Card className="min-h-[184px] p-4 md:min-h-[190px] md:p-5">
      <CardHeader className="mb-3">
        <CardTitle className="text-xs text-mute md:text-sm">
          <SensorIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          室內環境
        </CardTitle>
      </CardHeader>
      {sensor ? (
        <div className="flex flex-col gap-3">
          {/* 數值和提示皆可點擊，圖表在下方跨滿兩欄。 */}
          <button
            type="button"
            onClick={() => canExpand && setExpanded((p) => !p)}
            disabled={!canExpand}
            aria-expanded={canExpand ? expanded : undefined}
            aria-label={`${sensor.name}，${expanded ? "收合" : "查看"}環境趨勢`}
            className={`flex min-h-11 w-full flex-col items-start gap-3 rounded-[12px] text-left transition-colors ${
              canExpand ? "hover:bg-elevated/40 cursor-pointer" : "cursor-default"
            }`}
          >
            <ClimateReadout
              temp={sensor.temperature}
              humidity={sensor.humidity}
              co2={sensorHistory?.current?.co2 ?? null}
              size="compact"
            />
          <span className="min-w-0 max-w-full text-xs leading-relaxed text-mute">
            <span className="block truncate" title={sensor.name}>{sensor.name || sensor.location}</span>
            {canExpand && <span className="mt-1 flex items-center gap-1 text-[11px] text-cool">{expanded ? "收合趨勢" : "點擊查看 24h 趨勢"}<ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} /></span>}
          </span>
          </button>

        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-1 text-sm text-mute">
          請到
          <Link href="/devices" className="text-cool hover:text-cool/80 mx-1">裝置頁</Link>
          <Pin className="h-3.5 w-3.5" strokeWidth={2} />
          釘選一個感測器
        </p>
      )}
    </Card>
          <AnimatePresence initial={false}>
            {expanded && canExpand && (
              <motion.div
                key="chart"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  height: { duration: reduceMotion ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] },
                  opacity: { duration: reduceMotion ? 0 : 0.18, ease: "easeOut" },
                }}
                className="col-span-2 overflow-hidden"
              >
                <Card>
                <CardHeader><CardTitle>{sensor?.name} · 過去 24 小時</CardTitle><button type="button" onClick={() => setExpanded(false)} className="min-h-11 rounded-full px-3 text-xs text-mute hover:bg-elevated">收合趨勢</button></CardHeader>
                <SensorChart
                  history={sensorHistory!.history}
                  tempDomain={tempDomain!}
                  humDomain={humDomain!}
                  co2Domain={co2Domain ?? null}
                  acSegments={acSegments}
                  dehumSegments={dehumSegments}
                />
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
    </>
  );
}
