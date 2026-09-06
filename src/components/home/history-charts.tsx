"use client";

import { useCallback } from "react";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { type Sensor, computeSensorDomains } from "@/lib/sensor";
import { type AcDevice, getAcSegmentsForLocation } from "@/lib/ac";
import { type DehumDevice, getDehumSegmentsForLocation, dehumHistoryToSegments } from "@/lib/dehumidifier";
import type { DehumidifierAutoRule } from "@/lib/types";
import { SensorChart, AutoModeChart } from "@/components/devices/lazy-charts";

// These components mount only inside an open disclosure. Closing it removes their
// timers; current readings continue to use the separate, small summary response.
function useHistory(sensorName: string, withAc: boolean) {
  const sensors = useCachedFetch<Record<string, Sensor>>(`/api/sensors/status?name=${encodeURIComponent(sensorName)}`, {});
  const acs = useCachedFetch<Record<string, AcDevice>>("/api/ac/status", {}, withAc);
  const dehums = useCachedFetch<Record<string, DehumDevice>>("/api/dehumidifier/history", {});
  const { refetch: refreshSensors } = sensors;
  const { refetch: refreshAcs } = acs;
  const { refetch: refreshDehums } = dehums;
  const refresh = useCallback(async () => {
    await Promise.all([refreshSensors(), refreshAcs(), refreshDehums()]);
  }, [refreshSensors, refreshAcs, refreshDehums]);
  // History is recorded by the backend; it does not need the cloud-status 5s follow-up.
  useAutoRefresh(refresh, 60_000, 0);
  return {
    sensor: sensors.data[sensorName], acs: acs.data, dehums: dehums.data,
    loading: sensors.loading || acs.loading || dehums.loading,
    error: sensors.error || (withAc ? acs.error : null) || dehums.error,
    refresh,
  };
}

function HistoryNotice({ loading, error, hasData, retry }: { loading: boolean; error: string | null; hasData: boolean; retry: () => Promise<void> }) {
  if (error) return <p role="status" className="mb-3 text-sm text-mute">
    {hasData ? "部分趨勢暫時無法更新，保留上次資料。" : "暫時無法讀取趨勢。"}
    <button type="button" onClick={() => void retry()} disabled={loading} className="ml-2 min-h-9 rounded-full bg-cool-bg px-3 text-cool disabled:opacity-50">重試</button>
  </p>;
  if (!hasData) return <p role="status" className="py-6 text-sm text-mute">{loading ? "正在讀取趨勢…" : "尚無歷史資料"}</p>;
  return null;
}

export function EnvironmentHistory({ sensorName }: { sensorName: string }) {
  const h = useHistory(sensorName, true);
  const sensor = h.sensor;
  const hasData = !!sensor?.history?.length;
  const domains = computeSensorDomains(sensor ? [sensor] : []);
  return <>
    <HistoryNotice loading={h.loading} error={h.error} hasData={hasData} retry={h.refresh} />
    {hasData && <SensorChart history={sensor!.history} {...domains}
      acSegments={getAcSegmentsForLocation(h.acs, sensor!.location || "")}
      dehumSegments={getDehumSegmentsForLocation(h.dehums, sensor!.location || "")} />}
  </>;
}

export function DehumidifierHistory({ deviceName, rule }: { deviceName: string; rule: DehumidifierAutoRule }) {
  const h = useHistory(rule.sensor_name, false);
  const hasData = !!h.sensor?.history?.length;
  return <>
    <HistoryNotice loading={h.loading} error={h.error} hasData={hasData} retry={h.refresh} />
    {hasData && <AutoModeChart sensorHistory={h.sensor!.history}
      onSegments={dehumHistoryToSegments(h.dehums[deviceName]?.history ?? [])}
      humidityOnThreshold={rule.humidity_on_threshold ?? rule.threshold + 2}
      humidityOffThreshold={rule.humidity_off_threshold ?? rule.threshold - 1} />}
  </>;
}
