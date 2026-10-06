import test from "node:test";
import assert from "node:assert/strict";
import { NativeFrameClock, decodeNativeFrameId } from "../src/components/vision/native-frame";
import { createNativeMediaTransport, nativePreviewAllowed, NativeMediaError } from "../src/components/vision/native-media-transport";

test("native pixel marker decodes same-frame ID; ambiguous and missing pixels are not frames", () => {
  const pixels = new Uint8ClampedArray(192 * 24 * 4);
  for (const id of [1, 5, 127, 255, 32768, 65535]) {
    pixels.fill(0);
    for (let bit = 0; bit < 16; bit++) for (let y = 0; y < 24; y++) for (let x = bit * 12; x < bit * 12 + 12; x++) {
      const at = (y * 192 + x) * 4, light = id & (1 << bit) ? 250 : 6;
      pixels.set([light, light, light, 255], at);
    }
    assert.equal(decodeNativeFrameId(pixels), id);
  }
  pixels.fill(128); assert.equal(decodeNativeFrameId(pixels), null);
  pixels.fill(0); assert.equal(decodeNativeFrameId(pixels), null);
  assert.equal(decodeNativeFrameId(new Uint8ClampedArray(4)), null);
});

test("duplicate native frames with later timestamps cannot clear stale", () => {
  const clock = new NativeFrameClock();
  assert.equal(clock.snapshot(0).fresh, false);
  clock.ingest(12, 100); assert.equal(clock.snapshot(100).fresh, true);
  clock.ingest(12, 1300); clock.ingest(11, 1400); clock.ingest(null, 1550);
  assert.equal(clock.snapshot(1600).fresh, false); assert.equal(clock.snapshot(1600).advances, 1);
  clock.ingest(13, 1700); assert.deepEqual(clock.snapshot(1750), { id: 13, advances: 2, ageMs: 50, fresh: true });
  for (const id of [NaN, Infinity, -1, 65536, 14.5]) clock.ingest(id, 1900);
  assert.equal(clock.snapshot(1900).id, 13);
});

test("native preview requires explicit availability and preview grant independently of status/edit", () => {
  assert.equal(nativePreviewAllowed(undefined), false);
  assert.equal(nativePreviewAllowed({ capabilities: { preview: true } }), false);
  assert.equal(nativePreviewAllowed({ capabilities: { preview: false }, native_preview_available: true }), false);
  assert.equal(nativePreviewAllowed({ capabilities: { preview: true }, native_preview_available: true }), true);
});

async function withFetch(fake: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch; globalThis.fetch = fake;
  try { await run(); } finally { globalThis.fetch = original; }
}
const lease = "opaque-dashboard-lease-fixture";
test("native client only sends same-origin BFF commands and opaque lease; no Bearer/device URL", async () => {
  const calls: { path: string; body: unknown; keepalive?: boolean }[] = [];
  await withFetch(async (url, init) => {
    const path = String(url); assert.ok(path.startsWith("/api/vision/v1/"));
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined, keepalive: init?.keepalive });
    if (path.endsWith("offer")) return Response.json({ session_id: lease, type: "answer", sdp: "v=0\r\n", expires_at: 123 });
    if (path.endsWith("stop")) return Response.json({ active: false });
    if (path.endsWith("heartbeat")) return Response.json({ active: true });
    return Response.json({ capabilities: { preview: true }, native_preview_available: true });
  }, async () => {
    const client = createNativeMediaTransport(); await client.access(); await client.offer({ type: "offer", sdp: "v=0\r\n" }); await client.heartbeat(lease); await client.stop(lease);
  });
  assert.deepEqual(calls[1].body, { type: "offer", sdp: "v=0\r\n" });
  assert.deepEqual(calls[2].body, { session_id: lease, visible: true }); assert.deepEqual(calls[3].body, { session_id: lease }); assert.equal(calls[3].keepalive, true);
});

test("native client timeout and navigation abort cancel once without retry", async () => {
  let calls = 0;
  await withFetch(async (_, init) => { calls++; return new Promise<Response>((_, reject) => { init!.signal!.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true }); }); }, async () => {
    await assert.rejects(createNativeMediaTransport(10).access(), e => e instanceof NativeMediaError && e.status === 408);
    const controller = new AbortController(); const pending = createNativeMediaTransport().access(controller.signal); controller.abort(); await assert.rejects(pending, { name: "AbortError" });
    await assert.rejects(createNativeMediaTransport().access(controller.signal), { name: "AbortError" }); assert.equal(calls, 2);
  });
});

test("native client rejects malformed lease, failed heartbeat and revoked access", async () => {
  await withFetch(async () => Response.json({ session_id: "http://not-a-lease", type: "answer", sdp: "v=0", expires_at: 123 }), async () => {
    await assert.rejects(createNativeMediaTransport().offer({ type: "offer", sdp: "v=0" }), e => e instanceof NativeMediaError && e.status === 502);
  });
  await withFetch(async () => Response.json({ active: false }), async () => { await assert.rejects(createNativeMediaTransport().heartbeat(lease), NativeMediaError); });
  await withFetch(async () => new Response(null, { status: 403 }), async () => { await assert.rejects(createNativeMediaTransport().access(), e => e instanceof NativeMediaError && e.status === 403); });
});
