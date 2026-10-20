"use client";

import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { computeSensorDomains } from "@/lib/sensor";
import { HB, type DevicesPage, type History } from "@/lib/api";
import { acSegments, dehumidifierSegmentsAt, sensorHistory } from "@/lib/devices";
import { SensorChart } from "@/components/devices/lazy-charts";

export const HISTORY_URL = HB("history?parts=sensors,acs,dehumidifiers");
const EMPTY: History = { sensors: {}, acs: {}, computers: {}, dehumidifiers: {} };

/** The charts' history; mounted only while a chart is open. Recorded every 5 minutes, so read that often. */
export function useHistory(enabled = true) {
  const history = useCachedFetch<History>(HISTORY_URL, EMPTY, enabled);
  useAutoRefresh(history.refetch, 300_000, 0);
  return history;
}

function HistoryNotice({ loading, error, hasData, retry }: { loading: boolean; error: string | null; hasData: boolean; retry: () => Promise<void> }) {
  if (error) return <p role="status" className="mb-3 text-sm text-mute">
    {hasData ? "部分趨勢暫時無法更新，保留上次資料。" : "暫時無法讀取趨勢。"}
    <button type="button" onClick={() => void retry()} disabled={loading} className="ml-2 min-h-9 rounded-full bg-cool-bg px-3 text-cool disabled:opacity-50">重試</button>
  </p>;
  if (!hasData) return <p role="status" className="py-6 text-sm text-mute">{loading ? "正在讀取趨勢…" : "尚無歷史資料"}</p>;
  return null;
}

export function EnvironmentHistory({ sensorName, location, page }: { sensorName: string; location: string; page: DevicesPage | null }) {
  const h = useHistory();
  const points = sensorHistory(h.data, sensorName);
  return <>
    <HistoryNotice loading={h.loading} error={h.error} hasData={points.length > 0} retry={h.refetch} />
    {points.length > 0 && <SensorChart history={points} {...computeSensorDomains([points])}
      acSegments={acSegments(h.data, page, location)} dehumSegments={dehumidifierSegmentsAt(h.data, page, location)} />}
  </>;
}
