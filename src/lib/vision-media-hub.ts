/** Stateless Dashboard BFF transport to the dedicated HB media authority.
 * This adapter is test-only, fixed loopback and fake credentials. No lease map,
 * timers or viewer ownership persist in the Dashboard process.
 */
import { request as httpRequest } from "node:http";
import { MediaError, mediaRuntimeEnvironment } from "./vision-media-http";
import { validateSDP, type MediaOwner } from "./vision-media-leases";
export type HubAction = "offer" | "heartbeat" | "stop" | "state";
const TOKEN = "fixture-media-hub-service-public-only";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function mediaHubConfig(): {port: number; token: string} | undefined {
  if (typeof window !== "undefined" || mediaRuntimeEnvironment() !== "test" || process.env.VERCEL_ENV === "production" || process.env.DASHBOARD_VISION_MEDIA_HUB_FIXTURE_MODE !== "1") return;
  const port = process.env.DASHBOARD_VISION_MEDIA_HUB_FIXTURE_PORT ?? "";
  if (!/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535 || process.env.DASHBOARD_VISION_MEDIA_HUB_FIXTURE_TOKEN !== TOKEN) return;
  return {port: +port, token: TOKEN};
}
export function createMediaHub(config: {port: number; token: string}) {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || config.token !== TOKEN) throw new MediaError("media_disabled");
  async function call(action: HubAction, actor: MediaOwner, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (mediaRuntimeEnvironment() !== "test" || process.env.VERCEL_ENV === "production") throw new MediaError("media_disabled");
    if (!["offer", "heartbeat", "stop", "state"].includes(action)) throw new MediaError("media_invalid_request");
    const bytes = Buffer.from(JSON.stringify({...payload, actor: {id: actor.id, expires_at: actor.expiresAt / 1000}}));
    if (bytes.length > 32768) throw new MediaError("media_body_too_large");
    const reply = await new Promise<{status: number; body: unknown}>((resolve, reject) => {
      let done = false;
      const finish = (error?: Error, value?: {status: number; body: unknown}) => { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve(value!); };
      const req = httpRequest({hostname: "127.0.0.1", port: config.port, path: `/api/vision-media/v1/${action}`, method: "POST", agent: false, maxHeaderSize: 8192,
        headers: {Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "Content-Length": bytes.length}}, res => {
        let size = 0; const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {size += chunk.length; if (size > 32768) { finish(new MediaError("media_result_unknown")); req.destroy(); res.destroy(); } else chunks.push(chunk);});
        res.on("error", () => finish(new MediaError("media_result_unknown")));
        res.on("end", () => { try { finish(undefined, {status: res.statusCode ?? 503, body: JSON.parse(Buffer.concat(chunks).toString("utf8"))}); } catch { finish(new MediaError("media_result_unknown")); } });
      });
      const timer = setTimeout(() => {finish(new MediaError("media_result_unknown")); req.destroy();}, 5000);
      req.on("error", () => finish(new MediaError("media_result_unknown"))); req.end(bytes);
    });
    if (reply.status !== 200) {
      if (reply.status === 401 || reply.status === 403) throw new MediaError("vision_forbidden");
      if (reply.status === 404) throw new MediaError("media_session_not_found");
      if (reply.status === 409) throw new MediaError("media_viewer_busy");
      throw new MediaError("media_result_unknown");
    }
    const value = reply.body;
    if (!object(value)) throw new MediaError("media_result_unknown");
    if (action === "offer") {
      if (Object.keys(value).sort().join() !== "expires_at,sdp,session_id,type" || value.type !== "answer" || typeof value.session_id !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(value.session_id) || typeof value.expires_at !== "number" || !Number.isFinite(value.expires_at) || value.expires_at * 1000 <= Date.now() || value.expires_at * 1000 > Math.min(Date.now()+61000, actor.expiresAt+1000)) throw new MediaError("media_result_unknown");
      validateSDP(value.sdp);
      for (const line of value.sdp.split(/\r?\n/)) if (line.startsWith("a=candidate:") && line.split(/\s+/)[4] !== "127.0.0.1") throw new MediaError("media_result_unknown");
      return value;
    }
    if (typeof value.active !== "boolean") throw new MediaError("media_result_unknown");
    if (action === "heartbeat" && value.active) {
      if (typeof value.expires_at !== "number" || !Number.isFinite(value.expires_at)) throw new MediaError("media_result_unknown");
      return {active: true, expires_at: value.expires_at};
    }
    if (action === "stop" && value.active) throw new MediaError("media_result_unknown");
    const reasons = new Set(["lease_active", "not_started", "unknown", "user_stopped", "hidden"]);
    if (typeof value.reason !== "string" || !reasons.has(value.reason)) throw new MediaError("media_result_unknown");
    return {active: value.active, reason: value.reason, ...(action === "state" ? {media: null} : {})};
  }
  return {call};
}
