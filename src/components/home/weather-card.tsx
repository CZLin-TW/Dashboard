"use client";

import { MapPin } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClimateReadout } from "@/components/ui/device-controls";
import { type WeatherData, wxIcon } from "./types";

interface Props {
  weather: WeatherData | null;
}

/**
 * 首頁天氣卡：顯示位置、目前溫濕度（觀測值）、未來 24 小時預報摘要。
 * 沒拿到資料或資料缺損時顯示「載入中...」，不顯示假值。
 *
 * 溫濕度排版用共用的 ClimateReadout，跟 IndoorSensorCard / 裝置頁感應器
 * 卡視覺一致（大字 °C · 大字 %）。
 */
export function WeatherCard({ weather }: Props) {
  const hasValid = weather && !("error" in weather) && weather.max_t !== null;
  const obs = weather?.observation;
  const next24h = weather?.forecast?.next_24h;
  const WxIcon = wxIcon(next24h?.wx);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <MapPin className="h-4 w-4" strokeWidth={2} />
          {weather?.location ?? "--"} {obs?.observed_at ?? "--:--"}
        </CardTitle>
      </CardHeader>
      {hasValid ? (
        <div className="flex flex-col gap-2.5">
          <ClimateReadout temp={obs?.temp} humidity={obs?.humidity} size="lg" />
          <p className="flex items-center gap-1.5 text-sm text-mute">
            未來24h
            <WxIcon className="h-4 w-4" strokeWidth={2} />
            {next24h?.wx ?? ""}
            {next24h?.min_t !== null && next24h?.max_t !== null && next24h?.min_t !== undefined && next24h?.max_t !== undefined && ` · ${next24h.min_t}~${next24h.max_t}°C`}
            {next24h?.pop !== null && next24h?.pop !== undefined && ` · 降雨 ${next24h.pop}%`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-mute">載入中...</p>
      )}
    </Card>
  );
}
