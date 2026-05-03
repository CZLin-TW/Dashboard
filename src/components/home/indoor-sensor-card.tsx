"use client";

import Link from "next/link";
import { Pin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClimateReadout } from "@/components/ui/device-controls";
import { type DeviceData, DEVICE_ICONS, DEVICE_ICON_FALLBACK } from "@/lib/types";

interface Props {
  sensor: DeviceData | null;
}

/**
 * 室內感應器卡：顯示使用者釘選的感測器即時溫濕度。
 * 沒釘選時顯示提示，引導使用者到裝置頁釘選。
 *
 * 視覺對齊裝置頁的 sensor panel：Thermometer icon + 房間名 + ClimateReadout。
 * 不放 PinButton——pin 操作集中在裝置頁，首頁只是展示已釘選的結果。
 */
export function IndoorSensorCard({ sensor }: Props) {
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
          <ClimateReadout temp={sensor.temperature} humidity={sensor.humidity} size="lg" />
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
