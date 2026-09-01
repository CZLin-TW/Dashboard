"use client";

import dynamic from "next/dynamic";

/**
 * 所有用到 recharts 的元件統一從這裡以 next/dynamic 載入。
 *
 * 為什麼要這樣做：recharts 打包後 391 KB（gzip 113 KB）。靜態 import 時它會落進
 * `/` 與 `/devices` 兩頁的初始 chunk group，而 Next.js 要等 route 的所有 client
 * chunk 到齊才 hydrate——換句話說**家電控制的按鈕要等圖表函式庫下載＋解析完才能按**。
 * DeviceController 是最直接的受害者：它就是家電控制的核心 UI，卻靜態相依
 * AutoModeChart / HumidityCurveChart 這兩張圖。
 *
 * 而這些圖預設多半根本看不到：首頁的 SensorChart 收在摺疊區（expanded 預設 false）、
 * 除濕機那兩張只在自動模式開啟時才畫。拆成非同步 chunk 幾乎沒有代價。
 *
 * `ssr: false` 是必要的，不是省事：四張圖都依賴瀏覽器量測（ResponsiveContainer）
 * 與 `new Date()`，server render 的結果必然跟 client 對不上。
 *
 * ⚠️ 維護點：日後新增用到 recharts 的元件，一律加到這裡並從這裡 import。
 * 直接靜態 import 會**靜悄悄地**把 recharts 拉回初始 bundle——不會有任何錯誤訊息，
 * 只會讓這次的修正慢慢失效。
 */

/** 載入中的佔位：撐住近似高度，避免圖表到位時整張卡往下跳。 */
function ChartFallback({ height }: { height: number }) {
  return <div style={{ height }} aria-hidden />;
}

/** 溫度 + 濕度（+ 可選 CO2）堆疊折線圖。高度取 2 張子圖的常見情況。 */
export const SensorChart = dynamic(
  () => import("./sensor-chart").then((m) => m.SensorChart),
  { ssr: false, loading: () => <ChartFallback height={276} /> },
);

/** 除濕機自動模式的 24h 濕度線（只在 auto_mode=ON 時 render）。 */
export const AutoModeChart = dynamic(
  () => import("./auto-mode-chart").then((m) => m.AutoModeChart),
  { ssr: false, loading: () => <ChartFallback height={156} /> },
);

/** 自訂分時目標濕度的預覽圖（只在門檻來源＝自訂時 render）。 */
export const HumidityCurveChart = dynamic(
  () => import("./humidity-curve-chart").then((m) => m.HumidityCurveChart),
  { ssr: false, loading: () => <ChartFallback height={126} /> },
);

/** PC 卡的使用率 / 溫度雙圖。 */
export const ComputerCharts = dynamic(
  () => import("./computer-charts").then((m) => m.ComputerCharts),
  { ssr: false, loading: () => <ChartFallback height={330} /> },
);
