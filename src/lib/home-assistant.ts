export interface HaObservation {
  id: string; entity_id: string; name: string; area: string;
  kind: "occupancy" | "illuminance"; value: boolean | number | null;
  available: boolean; source_updated_at: number | null;
}
export interface HaSnapshot {
  configured: boolean; connected: boolean; online: boolean;
  received_at: number | null; age_seconds: number | null;
  stale_after_seconds: number; observations: HaObservation[];
  /** Dashboard 自己加的：區域編輯入口是否已設定。 */
  zone_editor?: boolean;
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

// ── 自動化記錄（唯讀） ──
export interface HaAutomationRule {
  entity_id: string; name: string;
  /** HA 離線時後端回 null：規則還在不在啟用狀態只有連線中才知道。 */
  enabled: boolean | null;
  /** 上次執行（unix 秒）。HA 重啟後仍保留，所以比 runs 撐得久。 */
  last_triggered: number | null;
}
export interface HaAutomationRun { entity_id: string; name: string; at: number; source?: string }
export interface HaAutomationLog {
  configured: boolean; online: boolean;
  /** HA 那邊有沒有勾選分享；沒勾就完全沒有資料。 */
  shared: boolean;
  received_at: number | null; rules: HaAutomationRule[]; runs: HaAutomationRun[];
}

const two = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** 「07:05」「昨天 23:40」「10/09 08:00」，以瀏覽器所在時區顯示。 */
export function automationTimeLabel(seconds: number, now = new Date()): string {
  const at = new Date(seconds * 1000);
  const time = `${two(at.getHours())}:${two(at.getMinutes())}`;
  if (dayKey(at) === dayKey(now)) return time;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(at) === dayKey(yesterday)) return `昨天 ${time}`;
  return `${two(at.getMonth() + 1)}/${two(at.getDate())} ${time}`;
}

export type AutomationNotice = "unconfigured" | "not_shared" | "offline" | null;

/** 卡片要畫的東西：最新的在最上面；為什麼可能是空的要講清楚，
 *  不然「今天沒有自動化執行」和「根本沒接上」長得一樣。 */
export function automationView(log: HaAutomationLog | null): {
  notice: AutomationNotice; runs: HaAutomationRun[]; rules: HaAutomationRule[];
} {
  if (!log) return { notice: null, runs: [], rules: [] };
  const notice: AutomationNotice = !log.configured ? "unconfigured" : !log.shared ? "not_shared" : !log.online ? "offline" : null;
  const runs = [...(log.runs ?? [])].sort((a, b) => b.at - a.at);
  const rules = [...(log.rules ?? [])].sort((a, b) => (b.last_triggered ?? 0) - (a.last_triggered ?? 0) || a.name.localeCompare(b.name, "zh-Hant"));
  return { notice, runs, rules };
}
