"use client";

import Link from "next/link";
import { Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClimateReadout } from "@/components/ui/device-controls";
import { type DeviceData, DEVICE_ICONS, DEVICE_ICON_FALLBACK } from "@/lib/types";
import type { Sensor } from "@/lib/sensor";
import { SensorChart } from "@/components/devices/sensor-chart";

interface Props {
  sensor: DeviceData | null;
  /** 對應 sensor.name 的歷史資料（從 /api/sensors/status 拉到，page 層 lookup 後傳入）。
   *  null 時不畫圖，純 readout。 */
  sensorHistory?: Sensor | null;
  tempDomain?: [number, number];
  humDomain?: [number, number];
}

/**
 * 室內感應器卡：左半 ClimateReadout、右半 24h 折線圖（溫度上、濕度下、compact 版本）。
 * 沒釘選時顯示提示，引導使用者到裝置頁釘選。
 *
 * 不放 PinButton——pin 操作集中在裝置頁，首頁只是展示已釘選的結果。
 */
export function IndoorSensorCard({ sensor, sensorHistory, tempDomain, humDomain }: Props) {
  const SensorIcon = DEVICE_ICONS["感應器"] ?? DEVICE_ICON_FALLBACK;

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
          {/* 永遠橫排：左邊 ClimateReadout 占其自然寬度，右邊 chart 撐剩餘空間。
              chart 高度跟 ClimateReadout 接近，加進來不會增加卡片整體高度。 */}
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <ClimateReadout temp={sensor.temperature} humidity={sensor.humidity} size="lg" />
            </div>
            <div className="flex-1 min-w-0">
              {sensorHistory && tempDomain && humDomain ? (
                <SensorChart
                  history={sensorHistory.history}
                  tempDomain={tempDomain}
                  humDomain={humDomain}
                  variant="compact"
                />
              ) : (
                <p className="px-1 text-xs text-mute">等待 24h 資料累積...</p>
              )}
            </div>
          </div>
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
