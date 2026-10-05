import assert from "node:assert/strict";
import test from "node:test";
import { createVisionTransport, VisionRequestError } from "../src/components/vision/transport";

async function withFetch(fake: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch; globalThis.fetch = fake;
  try { await run(); } finally { globalThis.fetch = original; }
}
function watchParent(signal: AbortSignal) {
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  let added = 0, removed = 0;
  signal.addEventListener = (...args: Parameters<typeof signal.addEventListener>) => { if (args[0] === "abort") added++; add(...args); };
  signal.removeEventListener = (...args: Parameters<typeof signal.removeEventListener>) => { if (args[0] === "abort") removed++; remove(...args); };
  return () => { assert.equal(added, 1); assert.equal(removed, 1); };
}

test("vision timeout aborts once and reports unknown outcome without retry", async () => {
  const parent = new AbortController(), clean = watchParent(parent.signal);
  let calls = 0, child: AbortSignal | undefined;
  await withFetch(async (_, init) => { calls++; child = init!.signal as AbortSignal; return new Promise<Response>(() => {}); }, async () => {
    await assert.rejects(createVisionTransport({ timeoutMs: 10 }).save({ revision: 0, model: "yolo11n", precision: "fp16" }, parent.signal),
      (error: unknown) => error instanceof VisionRequestError && error.status === 408 && error.message.includes("結果未知") && error.message.includes("不會自動重送"));
    assert.equal(calls, 1); assert.equal(child?.aborted, true); assert.equal(parent.signal.aborted, false); clean();
  });
});

test("parent abort cancels transport and removes forwarding listener", async () => {
  const parent = new AbortController(), clean = watchParent(parent.signal);
  const reason = new DOMException("Navigation", "AbortError");
  let child: AbortSignal | undefined;
  await withFetch(async (_, init) => { child = init!.signal as AbortSignal; return new Promise<Response>(() => {}); }, async () => {
    const pending = createVisionTransport({ timeoutMs: 100 }).preview(parent.signal);
    parent.abort(reason);
    await assert.rejects(pending, error => error === reason);
    assert.equal(child?.aborted, true); clean();
  });
});

test("already-aborted parent makes no request", async () => {
  const parent = new AbortController(); parent.abort();
  await withFetch(async () => { assert.fail("Aborted request must never fetch"); }, async () => {
    await assert.rejects(createVisionTransport().status(parent.signal), { name: "AbortError" });
  });
});

test("success keeps same-origin contract and cleans timer and listener", async () => {
  const parent = new AbortController(), clean = watchParent(parent.signal);
  let child: AbortSignal | undefined;
  await withFetch(async (url, init) => {
    assert.equal(url, "/api/vision/v1/preview"); assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.equal(init?.body, "{}");
    child = init?.signal as AbortSignal;
    return Response.json({ source: "synthetic", label: "demo" });
  }, async () => {
    assert.equal((await createVisionTransport({ timeoutMs: 10 }).preview(parent.signal)).source, "synthetic");
    clean(); parent.abort();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(child?.aborted, false);
  });
});

test("body parsing remains bounded and malformed JSON fails with cleanup", async () => {
  await withFetch(async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response, async () => {
    await assert.rejects(createVisionTransport({ timeoutMs: 10 }).config(), error => error instanceof VisionRequestError && error.status === 408);
  });
  const parent = new AbortController(), clean = watchParent(parent.signal);
  await withFetch(async () => new Response("invalid JSON", { status: 200 }), async () => {
    await assert.rejects(createVisionTransport().config(parent.signal), SyntaxError); clean();
  });
});

test("HTTP denied stays typed and timeout option stays bounded", async () => {
  await withFetch(async () => new Response(null, { status: 403 }), async () => {
    await assert.rejects(createVisionTransport().access(), error => error instanceof VisionRequestError && error.status === 403);
  });
  for (const timeoutMs of [0, -1, NaN, Infinity, 60001]) assert.throws(() => createVisionTransport({ timeoutMs }), RangeError);
});
