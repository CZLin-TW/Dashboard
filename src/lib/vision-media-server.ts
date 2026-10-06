/** Server-only media BFF. Production has no activation path; fixture configuration
 * and native credential never reach the browser. Session cookies are not retained.
 */
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { requestUser } from "./request-user";
import { requireVision, requireVisionMutation, visionJSON, visionError, visionUserHasCapability } from "./vision-server";
import { MediaError, mediaErrorDetails, createMediaUpstream, mediaFixtureConfig } from "./vision-media-http";
import { MediaLeaseStore, validateSDP, type MediaOwner } from "./vision-media-leases";

// One process-wide owner across Next route bundles/HMR; still not a distributed lock.
const STORE_KEY = Symbol.for("dashboard.vision-media.synthetic-leases.v1");
const shared = globalThis as typeof globalThis & { [STORE_KEY]?: { leases: MediaLeaseStore; timer?: ReturnType<typeof setInterval> } };
const state = shared[STORE_KEY] ??= { leases: new MediaLeaseStore(id => visionUserHasCapability(id, "preview")) };
const leases = state.leases;
function startCleanup() {
  if (state.timer) return;
  state.timer = setInterval(() => { void leases.sweep().catch(() => {}); }, 250);
  state.timer.unref();
}
export function nativeMediaAvailable() { return !!mediaFixtureConfig(); }
async function owner(request: Request): Promise<MediaOwner> {
  await requireVision(request, "preview");
  const id = await requestUser(request);
  const jwt = new NextRequest(request.url, { headers: request.headers }).cookies.get("dashboard_session")?.value;
  const expiry = jwt ? decodeJwt(jwt).exp : undefined;
  if (typeof expiry !== "number" || !Number.isFinite(expiry) || expiry * 1000 <= Date.now()) throw new MediaError("unauthorized", 401);
  return { id, expiresAt: expiry * 1000 };
}
async function body(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new MediaError("media_invalid_request", 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const value = await reader.read();
      if (value.done) break;
      size += value.value.byteLength;
      if (size > 32768) { void reader.cancel(); throw new MediaError("media_body_too_large", 413); }
      chunks.push(value.value);
    }
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      return value as Record<string, unknown>;
    } catch { throw new MediaError("media_invalid_request", 400); }
  };
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { void reader.cancel(); reject(new MediaError("media_body_timeout", 408)); }, 2000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join() !== [...keys].sort().join()) throw new MediaError("media_invalid_request", 400);
}
function leaseId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(value)) throw new MediaError("media_invalid_request", 400);
}
export async function mediaRoute(request: Request, action: "offer" | "heartbeat" | "stop" | "state") {
  try {
    const actor = await owner(request);
    if (new URL(request.url).search) throw new MediaError("media_invalid_request", 400);
    if (action !== "state") requireVisionMutation(request);
    const config = mediaFixtureConfig();
    if (!config) throw new MediaError("media_disabled");
    startCleanup();
    if (action === "state") return visionJSON(await leases.state(actor));
    const value = await body(request);
    if (action === "offer") {
      exact(value, ["type", "sdp"]);
      if (value.type !== "offer") throw new MediaError("media_invalid_request", 400);
      validateSDP(value.sdp);
      return visionJSON(await leases.offer(actor, value.sdp, createMediaUpstream(config), request.signal, async () => { await owner(request); }));
    }
    exact(value, action === "heartbeat" ? ["session_id", "visible"] : ["session_id"]);
    leaseId(value.session_id);
    if (action === "heartbeat") {
      if (typeof value.visible !== "boolean") throw new MediaError("media_invalid_request", 400);
      return visionJSON(await leases.heartbeat(actor, value.session_id, value.visible));
    }
    return visionJSON(await leases.stop(actor, value.session_id));
  } catch (error) {
    const mediaError = mediaErrorDetails(error);
    if (mediaError) return visionJSON({ code: mediaError.code, message: "預覽操作未完成或結果未知；不會自動重試。" }, mediaError.status);
    return visionError(error);
  }
}
