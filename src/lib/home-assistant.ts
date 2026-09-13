export interface HaObservation {
  id: string; entity_id: string; name: string; area: string;
  kind: "occupancy" | "illuminance"; value: boolean | number | null;
  available: boolean; source_updated_at: number | null;
}
export interface HaSnapshot {
  configured: boolean; connected: boolean; online: boolean;
  received_at: number | null; age_seconds: number | null;
  stale_after_seconds: number; observations: HaObservation[];
}

/** Receipt age, not the date a quiet sensor last changed. No browser/server clock comparison. */
export function haIsFresh(data: HaSnapshot | null, fetchedAt: number | null, now: number, failed: boolean): boolean {
  return !!data?.online && !failed && fetchedAt !== null && data.age_seconds !== null
    && data.age_seconds + Math.max(0, now - fetchedAt) / 1000 <= data.stale_after_seconds;
}

export function observationText(item: HaObservation, fresh: boolean): string {
  if (!fresh || !item.available || item.value === null) return "未知";
  if (item.kind === "occupancy") return item.value === true ? "有人" : item.value === false ? "無人" : "未知";
  return typeof item.value === "number" && Number.isFinite(item.value) ? item.value.toLocaleString("zh-TW", { maximumFractionDigits: 1 }) + " lx" : "未知";
}
