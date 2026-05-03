"use client";

import {
  MapPin,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudFog,
  Cloud,
  CloudSun,
  Sun,
  type LucideProps,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ClimateReadout } from "@/components/ui/device-controls";
import { type WeatherData } from "@/lib/types";

interface Props {
  weather: WeatherData | null;
}

/** 把 CWA 天氣現象文字對應到 lucide icon 的穩定 component。
 *  寫成 component 而不是 helper function 是因為 React 19 的
 *  react-hooks/static-components 不允許在 render 中 `const Icon = wxIcon(wx)`
 *  動態指派 component 變數。比對順序由強到弱（雷最緊急、多雲最輕）。 */
function WxIcon({ wx, ...props }: { wx: string | null | undefined } & LucideProps) {
  if (!wx) return <CloudSun {...props} />;
  if (wx.includes("雷")) return <CloudLightning {...props} />;
  if (wx.includes("雨")) return <CloudRain {...props} />;
  if (wx.includes("雪")) return <CloudSnow {...props} />;
  if (wx.includes("霧")) return <CloudFog {...props} />;
  if (wx.includes("陰")) return <Cloud {...props} />;
  if (wx.includes("多雲")) return <CloudSun {...props} />;
  if (wx.includes("晴")) return <Sun {...props} />;
  return <CloudSun {...props} />;
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
            <WxIcon wx={next24h?.wx} className="h-4 w-4" strokeWidth={2} />
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
