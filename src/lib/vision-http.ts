/** Server-only, opt-in loopback fixture transport. Importing creates no connection.
 * Never accepts a URL from a browser and never follows redirects or retries.
 */
import { randomUUID } from "node:crypto";
import type { VisionCapabilities, VisionConfig, VisionStatus } from "./vision-contract";

export class VisionHTTPError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export interface VisionHTTPTransport {
  status(capabilities: VisionCapabilities, signal?: AbortSignal): Promise<VisionStatus>;
  config(signal?: AbortSignal): Promise<VisionConfig>;
  save(config: VisionConfig, signal?: AbortSignal): Promise<VisionConfig>;
}
type ObjectValue = Record<string, unknown>;
const codes = new Set(["adapter_unavailable", "invalid_payload", "revision_conflict", "session_invalid", "deadline_exceeded", "duplicate_conflict", "execution_unknown", "capacity_exceeded", "device_unavailable", "credential_revoked", "protocol_invalid"]);
const object = (v: unknown): v is ObjectValue => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: ObjectValue, expected: string[]) => Object.keys(v).sort().join(",") === expected.sort().join(",");
const revision = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const model = (v: unknown) => v === "yolo11n" || v === "yolo11s";
const precision = (v: unknown) => v === "fp16" || v === "fp32";
function invalid(): never { throw new VisionHTTPError(502, "vision_protocol_invalid"); }
function detector(v: unknown): VisionConfig {
  if (!object(v) || !keys(v, ["revision", "model", "precision"]) || !revision(v.revision) || !model(v.model) || !precision(v.precision)) invalid();
  return { revision: v.revision as number, model: v.model as VisionConfig["model"], precision: v.precision as VisionConfig["precision"] };
}

export function createVisionHTTPTransport({ port, token, deviceId, timeoutMs = 8000 }: {
  port: number; token: string; deviceId: string; timeoutMs?: number;
}): VisionHTTPTransport {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^[A-Za-z0-9_-]{1,64}$/.test(deviceId) ||
      !/^[A-Za-z0-9._~-]{16,256}$/.test(token) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 29000) throw new VisionHTTPError(503, "vision_transport_unconfigured");
  const endpoint = `http://127.0.0.1:${port}/api/vision/v1/command`;
  async function command(action: "status.get" | "detector.configure", payload: object, parent?: AbortSignal): Promise<ObjectValue> {
    if (parent?.aborted) throw new VisionHTTPError(503, "vision_execution_unknown");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    parent?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    const requestId = randomUUID();
    try {
      const response = await fetch(endpoint, { method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ protocol: "vision.v1", type: "command", request_id: requestId, device_id: deviceId,
          action, deadline: Date.now() / 1000 + timeoutMs / 1000, payload }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new VisionHTTPError(503, "vision_execution_unknown"); }
      if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") { await response.body?.cancel(); invalid(); }
      const reader = response.body?.getReader();
      if (!reader) invalid();
      let total = 0; const chunks: Uint8Array[] = [];
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break;
          total += value.byteLength; if (total > 32768) { await reader.cancel(); invalid(); } chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let result: unknown;
      try { result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { invalid(); }
      if (!object(result) || result.protocol !== "vision.v1" || result.type !== "result" || result.request_id !== requestId || result.device_id !== deviceId ||
          typeof result.session_nonce !== "string" || !/^[A-Za-z0-9_-]{22,128}$/.test(result.session_nonce)) invalid();
      const base = ["protocol", "type", "request_id", "device_id", "session_nonce", "status"];
      if (result.status === "error" || result.status === "unknown") {
        if (!keys(result, [...base, "code"]) || typeof result.code !== "string" || !codes.has(result.code)) invalid();
        if (result.status === "error" && result.code === "revision_conflict") throw new VisionHTTPError(409, "vision_revision_conflict");
        throw new VisionHTTPError(503, result.status === "unknown" ? "vision_execution_unknown" : "vision_unavailable");
      }
      if (result.status !== "ok" || !keys(result, [...base, "payload"]) || !object(result.payload)) invalid();
      return result.payload;
    } catch (error) {
      if (error instanceof VisionHTTPError) throw error;
      throw new VisionHTTPError(503, "vision_execution_unknown");
    } finally { clearTimeout(timer); parent?.removeEventListener("abort", cancel); }
  }
  async function status(signal?: AbortSignal) {
    const p = await command("status.get", {}, signal);
    if (!keys(p, ["adapter", "available", "config_revision", "detector_revision", "detector", "zone_count"]) || p.adapter !== "synthetic" ||
        typeof p.available !== "boolean" || !revision(p.config_revision) || !revision(p.detector_revision) ||
        !Number.isInteger(p.zone_count) || (p.zone_count as number) < 0 || (p.zone_count as number) > 32 ||
        !object(p.detector) || !keys(p.detector, ["model", "precision"])) invalid();
    return { ...detector({ revision: p.detector_revision, ...p.detector }), available: p.available };
  }
  return {
    async status(capabilities, signal) { const value = await status(signal); return { revision: value.revision, model: value.model, precision: value.precision,
      source: value.available ? "synthetic" : "unavailable", online: value.available, reason: value.available ? "synthetic_fixture" : "adapter_unavailable", capabilities }; },
    async config(signal) { const value = await status(signal); if (!value.available) throw new VisionHTTPError(503, "vision_unavailable");
      return { revision: value.revision, model: value.model, precision: value.precision }; },
    async save(config, signal) { const value = detector(config); return detector(await command("detector.configure", {
      expected_revision: value.revision, model: value.model, precision: value.precision,
    }, signal)); },
  };
}

/** Local synthetic integration gate only. No production credential or URL setting. */
export function configuredVisionHTTPTransport(): VisionHTTPTransport | undefined {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" || process.env.DASHBOARD_VISION_FIXTURE_MODE !== "1") return undefined;
  const rawPort = process.env.DASHBOARD_VISION_FIXTURE_PORT || "";
  const token = process.env.DASHBOARD_VISION_FIXTURE_TOKEN || "";
  const deviceId = process.env.DASHBOARD_VISION_FIXTURE_DEVICE_ID || "";
  if (!/^\d{1,5}$/.test(rawPort) || !token.startsWith("fixture-")) return undefined;
  try { return createVisionHTTPTransport({ port: Number(rawPort), token, deviceId }); } catch { return undefined; }
}
