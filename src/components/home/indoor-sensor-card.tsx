"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { type DeviceData } from "./types";

interface Props {
  sensor: DeviceData | null;
}

/**
 * 室內感應器卡：顯示使用者釘選的感測器即時溫濕度。
 * 沒釘選時顯示提示，引導使用者到裝置頁釘選。
 */
export function IndoorSensorCard({ sensor }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>🌡️ 室內環境</CardTitle>
      </CardHeader>
      {sensor ? (
        <>
          <div className="flex items-baseline gap-6">
            <div><span className="text-3xl font-bold">{sensor.temperature}°C</span></div>
            <div><span className="text-3xl font-bold">{sensor.humidity}%</span></div>
          </div>
          <p className="mt-1 text-sm text-gray-500">{sensor.location || sensor.name}</p>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          請到
          <Link href="/devices" className="text-blue-400 hover:text-blue-300 mx-1">裝置頁</Link>
          📌 釘選一個感測器
        </p>
      )}
    </Card>
  );
}
