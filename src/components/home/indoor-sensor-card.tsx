"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClimateReadout } from "@/components/ui/device-controls";
import { type DeviceData, DEVICE_ICONS, DEVICE_ICON_FALLBACK } from "@/lib/types";
import type { Sensor } from "@/lib/sensor";
import type { AcSegment } from "@/lib/ac";
import { SensorChart } from "@/components/devices/sensor-chart";

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
}

/**
 * 室內感應器卡：預設只顯示 ClimateReadout（不增加卡高），點擊展開向下顯示
 * 24h 折線圖。展開動畫沿用首頁 DeviceQuickControl 同 pattern（motion height auto）。
 *
 * 不放 PinButton——pin 操作集中在裝置頁，首頁只是展示已釘選的結果。
 */
export function IndoorSensorCard({ sensor, sensorHistory, tempDomain, humDomain, co2Domain, acSegments }: Props) {
  const SensorIcon = DEVICE_ICONS["感應器"] ?? DEVICE_ICON_FALLBACK;
  const [expanded, setExpanded] = useState(false);
  const canExpand =
    !!(sensorHistory && tempDomain && humDomain && sensorHistory.history.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <SensorIcon className="h-4 w-4" strokeWidth={2} />
          室內環境
        </CardTitle>
      </CardHeader>
      {sensor ? (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold text-foreground">
            {sensor.location || sensor.name}
          </div>
          {/* readout 整列點擊展開（chart 有資料才能展開）；右邊 chevron 表 affordance */}
          <button
            type="button"
            onClick={() => canExpand && setExpanded((p) => !p)}
            disabled={!canExpand}
            className={`flex w-full items-center justify-between gap-2 rounded-[12px] px-1 py-1 text-left transition-colors ${
              canExpand ? "hover:bg-elevated/40 cursor-pointer" : "cursor-default"
            }`}
          >
            <ClimateReadout
              temp={sensor.temperature}
              humidity={sensor.humidity}
              co2={sensorHistory?.current?.co2 ?? null}
              size="lg"
            />
            {canExpand && (
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 text-mute transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
                strokeWidth={2}
              />
            )}
          </button>

          <AnimatePresence initial={false}>
            {expanded && canExpand && (
              <motion.div
                key="chart"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  height: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
                  opacity: { duration: 0.18, ease: "easeOut" },
                }}
                className="overflow-hidden"
              >
                <SensorChart
                  history={sensorHistory!.history}
                  tempDomain={tempDomain!}
                  humDomain={humDomain!}
                  co2Domain={co2Domain ?? null}
                  acSegments={acSegments}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <p className="flex items-center gap-1 text-sm text-mute">
          請到
          <Link href="/devices" className="text-cool hover:text-cool/80 mx-1">裝置頁</Link>
          <Pin className="h-3.5 w-3.5" strokeWidth={2} />
          釘選一個感測器
        </p>
      )}
    </Card>
  );
}
