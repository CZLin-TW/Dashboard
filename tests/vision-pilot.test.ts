import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";
import { environmentPilotCredential, configuredVisionPilotTransport, createVisionPilotTLSFixture } from "../src/lib/vision-pilot";
import { GET as access } from "../src/app/api/vision/v1/access/route";
import { GET as config, PUT as edit } from "../src/app/api/vision/v1/config/route";
import { GET as media } from "../src/app/api/vision/v1/media/state/route";

test("pilot credential provider reads rotation and expires without retaining secrets", () => {
  const env: Record<string,string> = {};
  const provider = environmentPilotCredential(env);
  assert.equal(provider.read(), undefined);
  env.DASHBOARD_VISION_PILOT_SERVICE_TOKEN="synthetic-pilot-token-first-1234567890";
  env.DASHBOARD_VISION_PILOT_EXPIRES_AT=String(Date.now()/1000+60);
  assert.equal(provider.read()?.token, env.DASHBOARD_VISION_PILOT_SERVICE_TOKEN);
  env.DASHBOARD_VISION_PILOT_SERVICE_TOKEN="synthetic-pilot-token-rotated-12345678";
  assert.equal(provider.read()?.token, env.DASHBOARD_VISION_PILOT_SERVICE_TOKEN);
  env.DASHBOARD_VISION_PILOT_EXPIRES_AT="Infinity"; assert.equal(provider.read(), undefined);
  env.DASHBOARD_VISION_PILOT_EXPIRES_AT="1"; assert.equal(provider.read(), undefined);
});

test("pilot is default off and production cannot select a fixture trust root or endpoint", () => {
  delete process.env.DASHBOARD_VISION_STATUS_PILOT;
  assert.equal(configuredVisionPilotTransport(), undefined);
  Object.assign(process.env, {NODE_ENV:"production",DASHBOARD_VISION_STATUS_PILOT:"1",DASHBOARD_VISION_PILOT_SERVICE_TOKEN:"synthetic-pilot-token-first-1234567890",DASHBOARD_VISION_PILOT_EXPIRES_AT:String(Date.now()/1000+60),DASHBOARD_VISION_PILOT_TLS_FIXTURE_PORT:"12345",DASHBOARD_VISION_PILOT_TLS_FIXTURE_CA:"/nonexistent"});
  assert.equal(configuredVisionPilotTransport(), undefined);
  assert.throws(()=>createVisionPilotTLSFixture(environmentPilotCredential({}),12345,"-----BEGIN CERTIFICATE-----"));
  delete process.env.DASHBOARD_VISION_STATUS_PILOT;
});

test("status-only pilot overrides broad grants and denies config edit and media before any egress", async () => {
  Object.assign(process.env,{NODE_ENV:"test",DASHBOARD_VISION_STATUS_PILOT:"1",DASHBOARD_VISION_GRANTS:JSON.stringify({alice:["status","preview","edit"]})});
  const token=await new SignJWT({lineUserId:"alice",role:"member"}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1m").sign(JWT_SECRET);
  const request=(path:string,method="GET")=>new Request(`http://localhost/api/vision/v1/${path}`,{method,headers:{cookie:`dashboard_session=${token}`,origin:"http://localhost","content-type":"application/json"},...(method==="PUT"?{body:"{}"}:{})});
  const a=await access(request("access")); assert.equal(a.status,200);
  assert.deepEqual((await a.json()).capabilities,{status:true,preview:false,edit:false});
  assert.equal((await config(request("config"))).status,403);
  assert.equal((await edit(request("config","PUT"))).status,403);
  assert.equal((await media(request("media/state"))).status,403);
  delete process.env.DASHBOARD_VISION_STATUS_PILOT;
});
