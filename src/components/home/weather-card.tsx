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
    <Card className="min-h-[184px] bg-gradient-to-br from-surface to-cool-bg/60 p-4 md:min-h-[190px] md:p-5">
      <CardHeader className="mb-3">
        <CardTitle className="min-w-0 text-xs text-mute md:text-sm">
          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          <span className="truncate">{weather?.location ?? "室外天氣"}</span>
        </CardTitle>
        <WxIcon wx={next24h?.wx} className="h-5 w-5 shrink-0 text-cool" strokeWidth={1.5} />
      </CardHeader>
      {hasValid ? (
        <div className="flex flex-col gap-3">
          <ClimateReadout temp={obs?.temp} humidity={obs?.humidity} size="compact" />
          <p className="text-xs leading-relaxed text-mute">
            <span className="block">未來 24h · {next24h?.wx ?? "預報更新中"}</span>
            {next24h?.min_t != null && next24h?.max_t != null && <span className="num">{next24h.min_t}–{next24h.max_t}°C</span>}
            {next24h?.pop != null && <span> · 降雨 {next24h.pop}%</span>}
            {obs?.observed_at && <span className="mt-1 hidden text-[11px] md:block">觀測更新 {obs.observed_at}</span>}
          </p>
        </div>
      ) : (
        <p className="text-sm text-mute">載入中...</p>
      )}
    </Card>
  );
}
