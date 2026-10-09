import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import { zoneEditorConfig, zoneEditorEntry, zoneEditorTicket } from "../src/lib/zone-editor";

const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const key = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const spki = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const url = "https://editor.example.ts.net";

test("zone editor is off unless a bare https origin and a private key are both configured", () => {
  assert.deepEqual(zoneEditorConfig({ ZONE_EDITOR_URL: url, ZONE_EDITOR_SIGNING_KEY: key }), { url, key: key.trim() });
  assert.deepEqual(zoneEditorConfig({ ZONE_EDITOR_URL: url + "/", ZONE_EDITOR_SIGNING_KEY: key.replace(/\n/g, "\\n") }), { url, key: key.trim() });
  for (const env of [
    {}, { ZONE_EDITOR_URL: url }, { ZONE_EDITOR_SIGNING_KEY: key },
    { ZONE_EDITOR_URL: "http://editor.example.ts.net", ZONE_EDITOR_SIGNING_KEY: key },
    { ZONE_EDITOR_URL: url + "/somewhere", ZONE_EDITOR_SIGNING_KEY: key },
    { ZONE_EDITOR_URL: url + ":8443", ZONE_EDITOR_SIGNING_KEY: key },
    { ZONE_EDITOR_URL: "https://user:pw@editor.example.ts.net", ZONE_EDITOR_SIGNING_KEY: key },
    { ZONE_EDITOR_URL: "not a url", ZONE_EDITOR_SIGNING_KEY: key },
    { ZONE_EDITOR_URL: url, ZONE_EDITOR_SIGNING_KEY: spki },
  ]) assert.equal(zoneEditorConfig(env), null, JSON.stringify(Object.keys(env)));
});

test("ticket is a one-minute ES256 token addressed to the editor, unique each time, with nothing about the user", async () => {
  const config = zoneEditorConfig({ ZONE_EDITOR_URL: url, ZONE_EDITOR_SIGNING_KEY: key })!;
  const now = Date.now();
  const ticket = await zoneEditorTicket(config, now);
  assert.equal(decodeProtectedHeader(ticket).alg, "ES256");
  const { payload } = await jwtVerify(ticket, await importSPKI(spki, "ES256"), { issuer: "dashboard", audience: url, currentDate: new Date(now) });
  assert.equal(payload.exp! - payload.iat!, 60);
  assert.ok(typeof payload.jti === "string" && payload.jti.length >= 16 && payload.jti.length <= 64);
  assert.deepEqual(Object.keys(payload).sort(), ["aud", "exp", "iat", "iss", "jti"]);
  assert.notEqual((await jwtVerify(await zoneEditorTicket(config, now), await importSPKI(spki, "ES256"), { currentDate: new Date(now) })).payload.jti, payload.jti);
  await assert.rejects(jwtVerify(ticket, await importSPKI(spki, "ES256"), { currentDate: new Date(now + 61_000) }));
  const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ type: "spki", format: "pem" }).toString();
  await assert.rejects(jwtVerify(ticket, await importSPKI(other, "ES256"), { currentDate: new Date(now) }));
});

test("entry address carries the ticket in the fragment, never in the path or query", async () => {
  const config = zoneEditorConfig({ ZONE_EDITOR_URL: url, ZONE_EDITOR_SIGNING_KEY: key })!;
  const back = await zoneEditorTicket(config, Date.now(), "https://dashboard.example");
  assert.equal((await jwtVerify(back, await importSPKI(spki, "ES256"))).payload.ret, "https://dashboard.example");
  const entry = new URL(await zoneEditorEntry(config));
  assert.equal(entry.origin + entry.pathname + entry.search, url + "/enter");
  assert.match(entry.hash, /^#ticket=[\w-]+\.[\w-]+\.[\w-]+$/);
});
