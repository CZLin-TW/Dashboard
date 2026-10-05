import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { JWT_SECRET } from "../src/lib/jwt";
import { GET as access } from "../src/app/api/vision/v1/access/route";
import { GET as status } from "../src/app/api/vision/v1/status/route";
import { GET as config, PUT as save } from "../src/app/api/vision/v1/config/route";
import { POST as preview } from "../src/app/api/vision/v1/preview/route";
import { proxy } from "../src/proxy";

const origin = "http://127.0.0.1:3012";
const validConfig = { revision: 0, model: "yolo11n", precision: "fp16" };
async function token(user: unknown = "member", role = "member", expiry: string | number | null = "5m", secret = JWT_SECRET) {
  let jwt = new SignJWT({ lineUserId: user, role }).setProtectedHeader({ alg: "HS256" });
  if (expiry !== null) jwt = jwt.setExpirationTime(expiry);
  return jwt.sign(secret);
}
function req(path: string, jwt?: string, method = "GET", headers: Record<string, string> = {}, body?: unknown) {
  return new Request(`${origin}/api/vision/v1/${path}`, { method, headers: { ...(jwt ? { cookie: `dashboard_session=${jwt}` } : {}), ...(method === "GET" ? {} : { origin, "content-type": "application/json" }), ...headers }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
}
async function responseStatus(response: Response, expected: number) {
  assert.equal(response.status, expected);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return await response.json();
}

test("real vision routes enforce JWT, explicit independent grants, body gates and no transport", async () => {
  const priorGrants = process.env.DASHBOARD_VISION_GRANTS;
  const priorDemo = process.env.DASHBOARD_DEMO_MODE;
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("network is forbidden in Phase 1"); };
  delete process.env.DASHBOARD_DEMO_MODE;
  try {
    const member = await token();
    const kid = await token("member", "kid");
    process.env.DASHBOARD_VISION_GRANTS = JSON.stringify({ member: ["status", "preview", "edit"] });
    for (const jwt of [undefined, "garbage", await token("member", "member", "5m", new TextEncoder().encode("wrong-test-secret")), await token("member", "member", Math.floor(Date.now()/1000)-5), await token("member", "member", null), await token({ forged: true })]) {
      for (const [path, handler, method] of [["access",access,"GET"],["status",status,"GET"],["config",config,"GET"],["config",save,"PUT"],["preview",preview,"POST"]] as const) {
        await responseStatus(await handler(req(path,jwt,method,{},validConfig)),401);
      }
    }
    for (const [path, handler, method] of [["access",access,"GET"],["status",status,"GET"],["config",config,"GET"],["config",save,"PUT"],["preview",preview,"POST"]] as const) {
      await responseStatus(await handler(req(path,kid,method,{},validConfig)),403);
    }
    await responseStatus(await access(req("access",undefined,"GET",{"X-Dashboard-User":"member","X-Vision-Capabilities":"edit,preview,status"})),401);
    const ungranted = await token("outsider");
    await responseStatus(await access(req("access",ungranted,"GET",{"X-Dashboard-User":"member"})),403);
    for (const policy of [undefined,"", "invalid", "[]", "null", JSON.stringify({member:["status"], other:["bogus"]}),JSON.stringify({member:["status"],other:"edit"}),JSON.stringify({member:[]}),JSON.stringify({member:["status","status"]})]) {
      if (policy === undefined) delete process.env.DASHBOARD_VISION_GRANTS;
      else process.env.DASHBOARD_VISION_GRANTS = policy;
      await responseStatus(await access(req("access",member)),403);
    }
    process.env.DASHBOARD_VISION_GRANTS=JSON.stringify({member:["status"]});
    assert.deepEqual(await responseStatus(await access(req("access",member)),200), {capabilities:{status:true,preview:false,edit:false}});
    await responseStatus(await status(req("status",member)),503);
    await responseStatus(await config(req("config",member)),503);
    await responseStatus(await preview(req("preview",member,"POST")),403);
    await responseStatus(await save(req("config",member,"PUT",{},validConfig)),403);
    process.env.DASHBOARD_VISION_GRANTS=JSON.stringify({member:["preview"]});
    await responseStatus(await status(req("status",member)),403);
    await responseStatus(await config(req("config",member)),403);
    await responseStatus(await preview(req("preview",member,"POST")),503);
    await responseStatus(await save(req("config",member,"PUT",{},validConfig)),403);
    process.env.DASHBOARD_VISION_GRANTS=JSON.stringify({member:["edit"]});
    await responseStatus(await status(req("status",member)),403);
    await responseStatus(await preview(req("preview",member,"POST")),403);
    await responseStatus(await save(req("config",member,"PUT",{},validConfig)),503);
    process.env.DASHBOARD_VISION_GRANTS=JSON.stringify({member:["status","preview","edit"]});
    for (const [path, handler, method] of [["status",status,"GET"],["config",config,"GET"],["config",save,"PUT"],["preview",preview,"POST"]] as const) {
      assert.deepEqual(await responseStatus(await handler(req(path,member,method,{},validConfig)),503),{code:"vision_unavailable",message:"尚未接通本機視覺服務"});
    }
    for (const [path, handler, method] of [["config",save,"PUT"],["preview",preview,"POST"]] as const) {
      for (const badOrigin of ["", "null", "https://evil.invalid", `${origin}.evil.invalid`]) await responseStatus(await handler(req(path,member,method,{origin:badOrigin},validConfig)),403);
      for (const contentType of ["", "text/plain", "application/x-www-form-urlencoded"]) await responseStatus(await handler(req(path,member,method,{"content-type":contentType},validConfig)),415);
      const noOrigin=req(path,member,method,{},validConfig);noOrigin.headers.delete("origin");
      await responseStatus(await handler(noOrigin),403);
    }
    for (const body of [{}, {...validConfig,revision:-1}, {...validConfig,revision:1.5}, {...validConfig,model:"remote-model"}, {...validConfig,precision:"int8"}, {...validConfig,url:"rtsp://private.invalid"}, {...validConfig,secret:"private-do-not-echo"}]) {
      const result=await responseStatus(await save(req("config",member,"PUT",{},body)),400);
      assert.ok(!JSON.stringify(result).includes("private"));
    }
    await responseStatus(await save(new Request(`${origin}/api/vision/v1/config`,{method:"PUT",headers:{cookie:`dashboard_session=${member}`,origin,"content-type":"application/json"},body:"{"})),400);
    await responseStatus(await save(req("config",member,"PUT",{},"x".repeat(5000))),413);
    await responseStatus(await proxy(new NextRequest(`${origin}/api/vision/v1/access`)),401);
    await responseStatus(await proxy(new NextRequest(`${origin}/api/vision/v1/access`,{headers:{cookie:`dashboard_session=${kid}`}})),403);
    assert.equal(requests,0);
  } finally {
    globalThis.fetch=originalFetch;
    if(priorGrants===undefined)delete process.env.DASHBOARD_VISION_GRANTS;else process.env.DASHBOARD_VISION_GRANTS=priorGrants;
    if(priorDemo===undefined)delete process.env.DASHBOARD_DEMO_MODE;else process.env.DASHBOARD_DEMO_MODE=priorDemo;
  }
});

test("production without a private session secret rejects even a signed development token", async () => {
  const { execFileSync } = await import("node:child_process");
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DASHBOARD_VISION_GRANTS: '{"member":["status"]}' };
  delete env.SESSION_JWT_SECRET;
  delete env.LINE_LOGIN_CHANNEL_SECRET;
  delete env.DASHBOARD_DEMO_MODE;
  const script = `
    const { SignJWT } = require('jose');
    const { GET } = require('./src/app/api/vision/v1/access/route.ts');
    (async () => {
      const jwt = await new SignJWT({lineUserId:'member'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('5m').sign(new TextEncoder().encode('dev-secret'));
      const response = await GET(new Request('http://localhost/api/vision/v1/access',{headers:{cookie:'dashboard_session='+jwt}}));
      if(response.status!==401 || response.headers.get('cache-control')!=='no-store')process.exit(1);
    })().catch(()=>process.exit(1));
  `;
  execFileSync(process.execPath,["--import","tsx","-e",script],{env,stdio:"pipe"});
});
