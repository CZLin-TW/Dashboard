/** Server-only synthetic native signaling. Fixed loopback host and paths, no proxy. */
import { request as httpRequest } from "node:http";

const MEDIA_ERROR_TAG = Symbol.for("dashboard.vision-media.error.v1");
const MEDIA_ERROR_STATUS = {
  unauthorized: 401, vision_forbidden: 403, media_disabled: 503,
  media_invalid_request: 400, media_invalid_sdp: 400, media_body_too_large: 413,
  media_body_timeout: 408, media_result_unknown: 503, media_viewer_busy: 409,
  media_session_not_found: 404,
} as const;
type MediaErrorCode = keyof typeof MEDIA_ERROR_STATUS;
export class MediaError extends Error {
  readonly [MEDIA_ERROR_TAG] = true;
  constructor(public code: MediaErrorCode, public status: number = MEDIA_ERROR_STATUS[code]) { super(code); }
}
/** Shared leases may throw from a different Next route bundle/realm. Never trust
 * instanceof alone, or serialize an arbitrary upstream exception/code/status.
 */
export function mediaErrorDetails(error: unknown): { code: MediaErrorCode; status: number } | undefined {
  if (!error || typeof error !== "object") return;
  const value = error as Record<PropertyKey, unknown>;
  if (value[MEDIA_ERROR_TAG] !== true || typeof value.code !== "string" || !Object.hasOwn(MEDIA_ERROR_STATUS, value.code)) return;
  const code = value.code as MediaErrorCode;
  if (value.status !== MEDIA_ERROR_STATUS[code]) return;
  return { code, status: MEDIA_ERROR_STATUS[code] };
}
/** Read the actual server process value. Next inlines direct process.env.NODE_ENV
 * during build; only an explicitly test-mode isolated next start may use fixtures.
 * A real production runtime remains denied regardless of build-time definitions.
 */
export function mediaRuntimeEnvironment(): unknown { return Reflect.get(process.env, "NODE_ENV"); }
export type MediaPath = "offer" | "heartbeat" | "stop";
export interface MediaUpstream {
  call(path: MediaPath, body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}
const MAX_BYTES = 32768;
export function mediaFixtureConfig(): { port: number; token: string } | undefined {
  if (typeof window !== "undefined" || mediaRuntimeEnvironment() !== "test" || process.env.VERCEL_ENV === "production" || process.env.DASHBOARD_VISION_MEDIA_FIXTURE_MODE !== "1") return;
  const port = process.env.DASHBOARD_VISION_MEDIA_FIXTURE_PORT ?? "";
  const token = process.env.DASHBOARD_VISION_MEDIA_FIXTURE_TOKEN ?? "";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535 || token !== "fixture-native-webrtc-public-only") return;
  return { port: Number(port), token };
}
export function createMediaUpstream(config: { port: number; token: string }, timeoutMs = 5000): MediaUpstream {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || config.token !== "fixture-native-webrtc-public-only" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new MediaError("media_disabled");
  return { call(path, body) {
    if (mediaRuntimeEnvironment() !== "test" || process.env.VERCEL_ENV === "production") return Promise.reject(new MediaError("media_disabled"));
    if (!["offer", "heartbeat", "stop"].includes(path)) return Promise.reject(new MediaError("media_invalid_request", 400));
    const bytes = Buffer.from(JSON.stringify(body));
    if (bytes.length > MAX_BYTES) return Promise.reject(new MediaError("media_body_too_large", 413));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: MediaError, value?: { status: number; body: unknown }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(value!);
      };
      const req = httpRequest({ hostname: "127.0.0.1", port: config.port, path: `/api/media/${path}`, method: "POST", agent: false, maxHeaderSize: 8192,
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "Content-Length": bytes.length } }, res => {
        const chunks: Buffer[] = []; let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) { finish(new MediaError("media_result_unknown")); req.destroy(); res.destroy(); }
          else chunks.push(chunk);
        });
        res.on("error", () => finish(new MediaError("media_result_unknown")));
        res.on("end", () => {
          try { finish(undefined, { status: res.statusCode ?? 503, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
          catch { finish(new MediaError("media_result_unknown")); }
        });
      });
      const timer = setTimeout(() => { finish(new MediaError("media_result_unknown")); req.destroy(); }, timeoutMs);
      req.on("error", () => finish(new MediaError("media_result_unknown")));
      req.end(bytes);
    });
  } };
}
