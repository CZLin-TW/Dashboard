import type { VisionHealthStatus } from "./vision-contract";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).sort().join() === [...expected].sort().join();
export function parseLocalHealth(value: unknown): Pick<VisionHealthStatus, "online" | "reason" | "service"> | undefined {
  if (!object(value) || !keys(value, ["adapter", "available", "service", "reason"]) || value.adapter !== "local-health" || typeof value.available !== "boolean" || !object(value.service) || !keys(value.service, ["reachable", "app_version", "mode", "config_schema"])) return;
  const service = value.service;
  if (service.reachable !== value.available) return;
  if (value.available) {
    if (value.reason !== "http_service_responding" || typeof service.app_version !== "string" || service.app_version.length > 32 || /\s/.test(service.app_version) || !/^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}(?:[-+][A-Za-z0-9.-]{1,16})?$/.test(service.app_version) || !["localhost-dev", "production"].includes(service.mode as string) || typeof service.config_schema !== "number" || !Number.isInteger(service.config_schema) || service.config_schema < 1 || service.config_schema > 100) return;
  } else if (value.reason !== "local_health_unavailable" || [service.app_version, service.mode, service.config_schema].some(v => v !== null)) return;
  return { online: value.available, reason: value.reason as VisionHealthStatus["reason"], service: { reachable: value.available, app_version: service.app_version as string | null, mode: service.mode as VisionHealthStatus["service"]["mode"], config_schema: service.config_schema as number | null } };
}
export function parseVisionHealthStatus(value: unknown): VisionHealthStatus | undefined {
  if (!object(value) || !keys(value, ["source", "online", "reason", "service", "capabilities"]) || value.source !== "local-health" || !object(value.capabilities) || !keys(value.capabilities, ["status", "preview", "edit"]) || value.capabilities.status !== true || value.capabilities.preview !== false || value.capabilities.edit !== false) return;
  const health = parseLocalHealth({ adapter: "local-health", available: value.online, reason: value.reason, service: value.service });
  return health ? { source: "local-health", ...health, capabilities: { status: true, preview: false, edit: false } } : undefined;
}
