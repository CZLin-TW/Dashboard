"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { type WeatherData, wxEmoji } from "./types";

interface Props {
  weather: WeatherData | null;
}

/**
 * 首頁天氣卡：顯示位置、目前溫濕度（觀測值）、未來 24 小時預報摘要。
 * 沒拿到資料或資料缺損時顯示「載入中...」，不顯示假值。
 */
export function WeatherCard({ weather }: Props) {
  const hasValid = weather && !("error" in weather) && weather.max_t !== null;
  const obs = weather?.observation;
  const next24h = weather?.forecast?.next_24h;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          📍 {weather?.location ?? "--"} {obs?.observed_at ?? "--:--"}
        </CardTitle>
      </CardHeader>
      {hasValid ? (
        <>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">
              {obs?.temp !== null && obs?.temp !== undefined ? `${obs.temp}°C` : "--°C"}
            </span>
            <span className="text-3xl font-bold">
              {obs?.humidity !== null && obs?.humidity !== undefined ? `${obs.humidity}%` : "--%"}
            </span>
          </div>
          <p className="mt-1 text-sm text-mute">
            未來24h {wxEmoji(next24h?.wx)} {next24h?.wx ?? ""}
            {next24h?.min_t !== null && next24h?.max_t !== null && next24h?.min_t !== undefined && next24h?.max_t !== undefined && ` · ${next24h.min_t}~${next24h.max_t}°C`}
            {next24h?.pop !== null && next24h?.pop !== undefined && ` · 降雨 ${next24h.pop}%`}
          </p>
        </>
      ) : (
        <p className="text-sm text-mute">載入中...</p>
      )}
    </Card>
  );
}
