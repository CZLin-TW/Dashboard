import assert from "node:assert/strict";
import test from "node:test";
import { clearQueryCache, queryKey, querySnapshot, refreshQuery, subscribeQuery } from "../src/lib/query-store";

test("queries share in-flight reads; replaced requests cannot overwrite fresh data", async () => {
  const original = globalThis.fetch;
  const pending: ((value: Response) => void)[] = [];
  globalThis.fetch = () => new Promise(resolve => pending.push(resolve));
  const url = "/api/todos", key = queryKey("alice", url);
  const unsubscribe = subscribeQuery(key, url, () => {});
  try {
    const old = refreshQuery(key, url);
    assert.equal(refreshQuery(key, url), old);
    assert.equal(pending.length, 1);
    const fresh = refreshQuery(key, url, true);
    pending[1](Response.json([{ name: "fresh" }])); await fresh;
    pending[0](Response.json([{ name: "old" }])); await old;
    assert.deepEqual(querySnapshot(key, url).data, [{ name: "fresh" }]);
    assert.equal(querySnapshot(queryKey("bob", url), url).hasData, false);
  } finally { unsubscribe(); clearQueryCache(); globalThis.fetch = original; }
});

test("failed refresh keeps good data and timestamp; first failure is not empty success", async () => {
  const original = globalThis.fetch;
  const url = "/api/todos", key = queryKey("alice", url);
  try {
    globalThis.fetch = async () => Response.json([{ name: "kept" }]);
    await refreshQuery(key, url);
    const before = querySnapshot(key, url);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await refreshQuery(key, url);
    assert.deepEqual(querySnapshot(key, url).data, before.data);
    assert.equal(querySnapshot(key, url).updatedAt, before.updatedAt);
    assert.ok(querySnapshot(key, url).error);
    const emptyKey = queryKey("bob", url);
    await refreshQuery(emptyKey, url);
    assert.equal(querySnapshot(emptyKey, url).hasData, false);
    assert.ok(querySnapshot(emptyKey, url).error);
  } finally { clearQueryCache(); globalThis.fetch = original; }
});

test("logout invalidates pending results even if transport ignores abort", async () => {
  const original = globalThis.fetch;
  let resolve!: (value: Response) => void;
  globalThis.fetch = () => new Promise(done => { resolve = done; });
  const url = "/api/dashboard", key = queryKey("alice", url);
  try {
    const pending = refreshQuery(key, url);
    clearQueryCache();
    resolve(Response.json({ private: "must disappear" })); await pending;
    assert.equal(querySnapshot(key, url).hasData, false);
  } finally { clearQueryCache(); globalThis.fetch = original; }
});

test("revoked private access discards the last successful response", async () => {
  const original = globalThis.fetch;
  const url = "/api/todos", key = queryKey("alice", url);
  try {
    globalThis.fetch = async () => Response.json([{ secret: "private" }]);
    await refreshQuery(key, url);
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await refreshQuery(key, url);
    assert.equal(querySnapshot(key, url).hasData, false);
    assert.equal(querySnapshot(key, url).data, undefined);
  } finally { clearQueryCache(); globalThis.fetch = original; }
});

test("an obsolete unauthorized response cannot erase a newer successful read", async () => {
  const original = globalThis.fetch;
  const pending: ((value: Response) => void)[] = [];
  globalThis.fetch = () => new Promise(resolve => pending.push(resolve));
  const url = "/api/todos", key = queryKey("alice", url);
  try {
    const old = refreshQuery(key, url);
    const fresh = refreshQuery(key, url, true);
    pending[1](Response.json(["fresh"])); await fresh;
    pending[0](new Response(null, {status:401})); await old;
    assert.deepEqual(querySnapshot(key, url).data, ["fresh"]);
  } finally { clearQueryCache(); globalThis.fetch = original; }
});
