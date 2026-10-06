import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { MediaError, mediaErrorDetails } from "../src/lib/vision-media-http";

type CompiledMedia = typeof import("../src/lib/vision-media-http");
function compileAsProduction(env: Record<string, string>) {
  const output = buildSync({
    entryPoints: [resolve("src/lib/vision-media-http.ts")], platform: "node", format: "cjs", bundle: true,
    write: false, define: { "process.env.NODE_ENV": '"production"' },
  }).outputFiles[0].text;
  const compiledModule = { exports: {} };
  runInNewContext(output, {
    module: compiledModule, exports: compiledModule.exports, process: { env },
    require: createRequire(resolve("package.json")), Buffer, setTimeout, clearTimeout,
  });
  return compiledModule.exports as CompiledMedia;
}
function fixtureEnvironment() {
  return { NODE_ENV: "test", DASHBOARD_VISION_MEDIA_FIXTURE_MODE: "1",
    DASHBOARD_VISION_MEDIA_FIXTURE_PORT: "12345", DASHBOARD_VISION_MEDIA_FIXTURE_TOKEN: "fixture-native-webrtc-public-only" };
}

test("production-compiled gate reads runtime environment but cannot activate production", async () => {
  const env: Record<string, string> = fixtureEnvironment();
  const compiled = compileAsProduction(env);
  assert.equal(compiled.mediaRuntimeEnvironment(), "test");
  assert.equal(compiled.mediaFixtureConfig()?.port, 12345);
  const transport = compiled.createMediaUpstream(compiled.mediaFixtureConfig()!);
  env.NODE_ENV = "production";
  assert.equal(compiled.mediaFixtureConfig(), undefined);
  await assert.rejects(transport.call("offer", {}), { code: "media_disabled" });
  env.NODE_ENV = "development";
  assert.equal(compiled.mediaFixtureConfig(), undefined);
  env.NODE_ENV = "test"; env.VERCEL_ENV = "production";
  assert.equal(compiled.mediaFixtureConfig(), undefined);
  await assert.rejects(transport.call("offer", {}), { code: "media_disabled" });
  delete env.VERCEL_ENV; delete env.DASHBOARD_VISION_MEDIA_FIXTURE_MODE;
  assert.equal(compiled.mediaFixtureConfig(), undefined);
});

test("media errors cross independent route bundle realms with fixed safe code/status only", () => {
  const first = compileAsProduction(fixtureEnvironment());
  const second = compileAsProduction(fixtureEnvironment());
  const foreign = new first.MediaError("media_session_not_found", 404);
  assert.equal(foreign instanceof MediaError, false);
  assert.equal(foreign instanceof second.MediaError, false);
  assert.deepEqual(mediaErrorDetails(foreign), { code: "media_session_not_found", status: 404 });
  assert.equal(second.mediaErrorDetails(foreign)?.status, 404);
  assert.equal(mediaErrorDetails({ code: "media_session_not_found", status: 404 }), undefined);
  const tag = Symbol.for("dashboard.vision-media.error.v1");
  assert.equal(mediaErrorDetails({ [tag]: true, code: "PRIVATE-UPSTREAM-TEXT", status: 503 }), undefined);
  assert.equal(mediaErrorDetails({ [tag]: true, code: "media_session_not_found", status: 200 }), undefined);
  assert.equal(mediaErrorDetails(new Error("PRIVATE-UPSTREAM-TEXT")), undefined);
});
