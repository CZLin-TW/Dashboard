/** Server-only synthetic native signaling. Fixed loopback host and paths, no proxy. */
import { request as httpRequest } from "node:http";

export class MediaError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export type MediaPath = "offer" | "heartbeat" | "stop";
export interface MediaUpstream {
  call(path: MediaPath, body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}
const MAX_BYTES = 32768;
export function mediaFixtureConfig(): { port: number; token: string } | undefined {
  if (typeof window !== "undefined" || process.env.NODE_ENV !== "test" || process.env.VERCEL_ENV === "production" || process.env.DASHBOARD_VISION_MEDIA_FIXTURE_MODE !== "1") return;
  const port = process.env.DASHBOARD_VISION_MEDIA_FIXTURE_PORT ?? "";
  const token = process.env.DASHBOARD_VISION_MEDIA_FIXTURE_TOKEN ?? "";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535 || token !== "fixture-native-webrtc-public-only") return;
  return { port: Number(port), token };
}
export function createMediaUpstream(config: { port: number; token: string }, timeoutMs = 5000): MediaUpstream {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || config.token !== "fixture-native-webrtc-public-only" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new MediaError("media_disabled");
  return { call(path, body) {
    if (process.env.NODE_ENV !== "test" || process.env.VERCEL_ENV === "production") return Promise.reject(new MediaError("media_disabled"));
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
