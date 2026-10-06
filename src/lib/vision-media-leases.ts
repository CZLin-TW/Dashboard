/** Bounded, in-memory single-viewer leases. No distributed/persistent ownership claim. */
import { randomBytes } from "node:crypto";
import { MediaError, type MediaUpstream } from "./vision-media-http";
export interface MediaOwner { id: string; expiresAt: number }
type Phase = "pending" | "active" | "closing" | "unknown";
interface Lease { id: string; owner: MediaOwner; upstream: MediaUpstream; nativeId?: string; phase: Phase; expiresAt: number; safetyUntil: number; cancelled: boolean; close?: Promise<void> }
const MAX_TTL_MS = 60000;
const identifier = /^[A-Za-z0-9_-]{16,128}$/;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
export function validateSDP(value: unknown): asserts value is string {
  if (typeof value !== "string" || Buffer.byteLength(value) > 30000 || !/^v=0\r?\n/.test(value) || value.includes("\0")) throw new MediaError("media_invalid_sdp", 400);
}
function answer(raw: unknown, now: number) {
  if (!record(raw) || Object.keys(raw).sort().join() !== "expires_at,sdp,session_id,type" || typeof raw.session_id !== "string" || !identifier.test(raw.session_id) || raw.type !== "answer" || typeof raw.expires_at !== "number" || !Number.isFinite(raw.expires_at) || raw.expires_at * 1000 <= now || raw.expires_at * 1000 > now + MAX_TTL_MS + 1000) throw new MediaError("media_result_unknown");
  validateSDP(raw.sdp);
  for (const line of raw.sdp.split(/\r?\n/)) {
    if (line.startsWith("a=candidate:")) {
      const fields = line.split(/\s+/);
      if (fields.length < 8 || fields[4] !== "127.0.0.1" || fields[2].toLowerCase() !== "udp") throw new MediaError("media_result_unknown");
    }
  }
  return { session_id: raw.session_id, sdp: raw.sdp, type: "answer" as const, expires_at: raw.expires_at };
}
export class MediaLeaseStore {
  private lease?: Lease;
  private sweeping?: Promise<void>;
  private closed = new Map<string, { owner: string; until: number }>();
  constructor(private allowed: (owner: string) => boolean, private now: () => number = Date.now) {}
  private authorized(lease: Lease) { return this.allowed(lease.owner.id) && lease.owner.expiresAt > this.now(); }
  private async terminate(lease: Lease) {
    lease.cancelled = true;
    if (lease.close) return lease.close;
    if (!lease.nativeId) { lease.phase = "unknown"; return; }
    lease.phase = "closing";
    lease.close = (async () => {
      try {
        const reply = await lease.upstream.call("stop", { session_id: lease.nativeId });
        if (!(reply.status === 404 || reply.status === 200 && record(reply.body) && reply.body.active === false)) throw new MediaError("media_result_unknown");
        if (this.lease === lease) this.lease = undefined;
        this.closed.set(lease.id, { owner: lease.owner.id, until: this.now() + MAX_TTL_MS });
        while (this.closed.size > 16) this.closed.delete(this.closed.keys().next().value!);
      } catch { lease.phase = "unknown"; }
    })();
    await lease.close;
  }
  async sweep() {
    if (this.sweeping) return this.sweeping;
    this.sweeping = (async () => {
      for (const [id, value] of this.closed) if (value.until <= this.now()) this.closed.delete(id);
      const lease = this.lease;
      if (!lease) return;
      if (this.now() >= lease.safetyUntil) { this.lease = undefined; return; }
      if (lease.phase === "unknown" || lease.phase === "closing") return;
      if (!this.authorized(lease) || this.now() >= lease.expiresAt) await this.terminate(lease);
    })();
    try { await this.sweeping; } finally { this.sweeping = undefined; }
  }
  async offer(owner: MediaOwner, sdp: string, upstream: MediaUpstream, signal: AbortSignal, reauthorize: () => Promise<void>) {
    validateSDP(sdp);
    await this.sweep();
    await reauthorize();
    if (!this.allowed(owner.id) || owner.expiresAt <= this.now()) throw new MediaError("vision_forbidden", 403);
    if (signal.aborted) throw new MediaError("media_result_unknown");
    if (this.lease) throw new MediaError("media_viewer_busy", 409);
    const now = this.now();
    const lease: Lease = { id: randomBytes(24).toString("base64url"), owner, upstream, phase: "pending", expiresAt: Math.min(now + MAX_TTL_MS, owner.expiresAt), safetyUntil: now + MAX_TTL_MS + 7000, cancelled: false };
    this.lease = lease;
    const aborted = () => { lease.cancelled = true; };
    signal.addEventListener("abort", aborted, { once: true });
    try {
      // Keep the bounded native request alive after browser abort so its late session
      // ID can be learned and stopped. A timeout without an ID is quarantined to TTL.
      const response = await upstream.call("offer", { device_id: "synthetic-mini", type: "offer", sdp });
      if (record(response.body) && typeof response.body.session_id === "string" && identifier.test(response.body.session_id)) lease.nativeId = response.body.session_id;
      if (response.status !== 200) {
        if (response.status === 409 && !lease.nativeId) { this.lease = undefined; throw new MediaError("media_viewer_busy", 409); }
        throw new MediaError("media_result_unknown");
      }
      const value = answer(response.body, this.now());
      lease.expiresAt = Math.min(value.expires_at * 1000, owner.expiresAt, now + MAX_TTL_MS);
      lease.safetyUntil = value.expires_at * 1000 + 2000;
      await reauthorize();
      if (lease.cancelled || signal.aborted || this.lease !== lease || !this.authorized(lease) || this.now() >= lease.expiresAt) throw new MediaError("media_result_unknown");
      lease.phase = "active";
      return { session_id: lease.id, sdp: value.sdp, type: value.type, expires_at: lease.expiresAt / 1000 };
    } catch (error) {
      await this.terminate(lease);
      throw error;
    } finally { signal.removeEventListener("abort", aborted); }
  }
  private owned(owner: MediaOwner, id: string) {
    const lease = this.lease;
    if (!lease || lease.id !== id || lease.owner.id !== owner.id) throw new MediaError("media_session_not_found", 404);
    return lease;
  }
  async stop(owner: MediaOwner, id: string) {
    const closed = this.closed.get(id);
    if (closed?.owner === owner.id && closed.until > this.now()) return { active: false, reason: "user_stopped" };
    const lease = this.owned(owner, id);
    await this.terminate(lease);
    if (this.lease === lease) throw new MediaError("media_result_unknown");
    return { active: false, reason: "user_stopped" };
  }
  async heartbeat(owner: MediaOwner, id: string, visible: boolean) {
    await this.sweep();
    const lease = this.owned(owner, id);
    if (lease.phase !== "active" || !this.authorized(lease)) throw new MediaError("media_result_unknown");
    if (!visible) { await this.stop(owner, id); return { active: false, reason: "hidden" }; }
    try {
      const reply = await lease.upstream.call("heartbeat", { session_id: lease.nativeId, visible: true });
      if (reply.status !== 200 || !record(reply.body) || reply.body.active !== true || this.lease !== lease || lease.phase !== "active" || lease.cancelled || !this.authorized(lease) || this.now() >= lease.expiresAt) throw new MediaError("media_result_unknown");
      return { active: true, expires_at: lease.expiresAt / 1000 };
    } catch { await this.terminate(lease); throw new MediaError("media_result_unknown"); }
  }
  async state(owner: MediaOwner) {
    await this.sweep();
    const lease = this.lease;
    if (!lease || lease.owner.id !== owner.id) return { active: false, reason: "not_started", media: null };
    return { active: lease.phase === "active", reason: lease.phase === "active" ? "lease_active" : "unknown", media: null };
  }
}
