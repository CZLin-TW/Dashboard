import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../src/lib/jwt";
import { environmentPilotCredential, configuredVisionPilotTransport, createVisionPilotTLSFixture } from "../src/lib/vision-pilot";
import { GET as access } from "../src/app/api/vision/v1/access/route";
import { GET as status } from "../src/app/api/vision/v1/status/route";
import { GET as config, PUT as edit } from "../src/app/api/vision/v1/config/route";
import { GET as media } from "../src/app/api/vision/v1/media/state/route";

type Call = { options: https.RequestOptions; body: Record<string, unknown> | undefined };
type Reply = { status?: number; body: unknown; beforeReply?: () => void };
function fixture(t: test.TestContext, handler: (call: Call) => Reply) {
  const previous = {...process.env};
  const dir = mkdtempSync(join(tmpdir(),"vision-pilot-test-"));
  const ca = join(dir,"ca.pem"); writeFileSync(ca,"-----BEGIN CERTIFICATE-----\nfixture-only\n");
  Object.assign(process.env,{NODE_ENV:"test",DASHBOARD_VISION_STATUS_PILOT:"1",HOME_BUTLER_API_KEY:"fixture-existing-household-key",DASHBOARD_VISION_PILOT_TLS_FIXTURE_PORT:"12345",DASHBOARD_VISION_PILOT_TLS_FIXTURE_CA:ca});
  delete process.env.DASHBOARD_VISION_GRANTS;
  delete process.env.DASHBOARD_VISION_PILOT_SERVICE_TOKEN;
  delete process.env.VERCEL_ENV;
  const calls: Call[] = [];
  t.mock.method(https,"request",(options: https.RequestOptions, callback: (res: EventEmitter & {statusCode:number;headers:object;destroy:()=>void})=>void)=>{
    const req = new EventEmitter() as EventEmitter & {end:(bytes?:Buffer)=>void;destroy:()=>void};
    req.destroy=()=>{};
    req.end=bytes=>{
      const call={options,body:bytes ? JSON.parse(bytes.toString()) : undefined};calls.push(call);
      queueMicrotask(()=>{
        const result=handler(call);
        const res=Object.assign(new EventEmitter(),{statusCode:result.status??200,headers:{"content-type":"application/json"},destroy:()=>{}});
        callback(res); result.beforeReply?.();
        res.emit("data",Buffer.from(JSON.stringify(result.body)));res.emit("end");
      });
    };
    return req;
  });
  syncBuiltinESMExports();
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);rmSync(dir,{recursive:true,force:true})});
  return calls;
}
const caps = {capabilities:{status:true,preview:true,edit:true}};
function result(call: Call) {
  return {protocol:"vision.v1",type:"result",request_id:call.body!.request_id,device_id:"floor-mini-01",session_nonce:"abcdefghijklmnopqrstuvwxyz012345",status:"ok",payload:{adapter:"synthetic",available:true,config_revision:0,detector_revision:0,detector:{model:"yolo11n",precision:"fp32"},zone_count:0}};
}
async function token(role="member",expiry?: number) { return new SignJWT({lineUserId:"alice",role}).setProtectedHeader({alg:"HS256"}).setExpirationTime(expiry??Math.floor(Date.now()/1000)+60).sign(JWT_SECRET); }
function request(jwt:string,path="status",method="GET") { return new Request(`http://localhost/api/vision/v1/${path}`,{method,headers:{cookie:`dashboard_session=${jwt}`,origin:"http://localhost","content-type":"application/json","X-Dashboard-User":"mallory","X-Dashboard-Role":"member","X-Dashboard-Session-Expires":"9999999999","X-API-Key":"client-spoof"},...(method==="PUT"?{body:"{}"}:{})}); }

test("pilot reuses existing household key and reads rotation; old vision token has no authority",()=>{
  const env:Record<string,string>={DASHBOARD_VISION_PILOT_SERVICE_TOKEN:"retired-vision-service-token"};const provider=environmentPilotCredential(env);
  assert.equal(provider.read(),undefined);env.HOME_BUTLER_API_KEY="existing-family-key";assert.equal(provider.read(),env.HOME_BUTLER_API_KEY);env.HOME_BUTLER_API_KEY="rotated-family-key";assert.equal(provider.read(),env.HOME_BUTLER_API_KEY);env.HOME_BUTLER_API_KEY="invalid\r\nheader";assert.equal(provider.read(),undefined);
});

test("pilot default off and production fixture cannot replace TLS endpoint or trust",t=>{
  fixture(t,()=>({body:caps}));delete process.env.DASHBOARD_VISION_STATUS_PILOT;assert.equal(configuredVisionPilotTransport(),undefined);process.env.DASHBOARD_VISION_STATUS_PILOT="1";Object.assign(process.env,{NODE_ENV:"production"});assert.equal(configuredVisionPilotTransport(),undefined);assert.throws(()=>createVisionPilotTLSFixture(environmentPilotCredential({}),12345,"-----BEGIN CERTIFICATE-----"));
});

test("HB grants are authoritative without local grants; verified JWT headers cannot be spoofed",async t=>{
  const calls=fixture(t,call=>({body:call.options.path?.endsWith("/access")?caps:result(call)}));const jwt=await token();
  const response=await status(request(jwt));assert.equal(response.status,200);assert.equal((await response.json()).source,"synthetic");assert.equal(calls.length,3);
  for(const call of calls){const headers=call.options.headers as Record<string,string>;assert.equal(headers["X-API-Key"],"fixture-existing-household-key");assert.equal(headers["X-Dashboard-User"],"alice");assert.equal(headers["X-Dashboard-Role"],"member");assert(Number(headers["X-Dashboard-Session-Expires"])<9999999999);assert.equal(headers.Authorization,undefined);assert.equal(call.options.rejectUnauthorized,true);assert.equal(call.options.servername,"localhost")}
});

test("kid parent identity, expired JWT and missing expiry fail before HB egress",async t=>{
  const calls=fixture(t,()=>({body:caps}));assert.equal((await access(request(await token("kid"),"access"))).status,403);assert.equal((await status(request(await token("member",1)))).status,401);
  const noExpiry=await new SignJWT({lineUserId:"alice"}).setProtectedHeader({alg:"HS256"}).sign(JWT_SECRET);assert.equal((await status(request(noExpiry))).status,401);assert.equal(calls.length,0);
});

test("status-only activation masks broad HB grants and denies config writes/media",async t=>{
  const calls=fixture(t,()=>({body:caps}));const jwt=await token();const response=await access(request(jwt,"access"));assert.deepEqual((await response.json()).capabilities,{status:true,preview:false,edit:false});
  assert.equal((await config(request(jwt,"config"))).status,403);const before=calls.length;assert.equal((await edit(request(jwt,"config","PUT"))).status,403);assert.equal((await media(request(jwt,"media/state"))).status,403);assert.equal(calls.length,before);
});

test("HB refresh failure never reuses a cached allow; current revoke denies",async t=>{
  let allowed=true;const calls=fixture(t,()=>allowed?{body:caps}:{status:503,body:{code:"registry_unavailable"}});const jwt=await token();assert.equal((await access(request(jwt,"access"))).status,200);allowed=false;assert.equal((await access(request(jwt,"access"))).status,503);assert.equal(calls.length,2);
});

test("revocation during a status response is checked before releasing the result",async t=>{
  let allowed=true;fixture(t,call=>call.options.path?.endsWith("/access")?{status:allowed?200:403,body:allowed?caps:{code:"forbidden"}}:{body:result(call),beforeReply:()=>{allowed=false}});
  const response=await status(request(await token()));assert.equal(response.status,403);assert.equal((await response.json()).source,undefined);
});

test("household key rotation and late JWT expiry discard responses",async t=>{
  let mode="rotate";const now=Date.now;fixture(t,()=>({body:caps,beforeReply:()=>{if(mode==="rotate")process.env.HOME_BUTLER_API_KEY="new-household-key";else t.mock.method(Date,"now",()=>now()+100000)}}));
  assert.equal((await access(request(await token(),"access"))).status,503);
  mode="expire";assert.equal((await access(request(await token(),"access"))).status,401);
});
