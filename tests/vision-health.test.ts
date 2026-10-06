import test from "node:test";
import assert from "node:assert/strict";
import { parseLocalHealth, parseVisionHealthStatus } from "../src/lib/vision-health";
const healthy = () => ({adapter:"local-health",available:true,service:{reachable:true,app_version:"1.2.3",mode:"localhost-dev",config_schema:2},reason:"http_service_responding"});
test("health distinguishes channel reply from HTTP availability and preserves only whitelist",()=>{
  assert.equal(parseLocalHealth(healthy())?.online,true);
  const down={adapter:"local-health",available:false,service:{reachable:false,app_version:null,mode:null,config_schema:null},reason:"local_health_unavailable"};
  assert.equal(parseLocalHealth(down)?.online,false);
  assert.equal(parseLocalHealth({...healthy(),camera:"secret"}),undefined);
  assert.equal(parseLocalHealth({...down,service:{...down.service,app_version:"1.2.3"}}),undefined);
  assert.equal(parseLocalHealth({...healthy(),service:{...healthy().service,reachable:false}}),undefined);
});
test("positive health requires all exact metadata; rejects injected URLs and partial semver",()=>{
  for(const key of ["app_version","mode","config_schema"])assert.equal(parseLocalHealth({...healthy(),service:{...healthy().service,[key]:null}}),undefined);
  for(const version of ["1.2.3\n","1.2.3\r","10000.2.3","1.2.3-12345678901234567","http://camera"])assert.equal(parseLocalHealth({...healthy(),service:{...healthy().service,app_version:version}}),undefined);
  for(const schema of [true,0,101,1.5])assert.equal(parseLocalHealth({...healthy(),service:{...healthy().service,config_schema:schema}}),undefined);
});
test("browser health parser rejects synthetic, legacy detector data and granted write capabilities",()=>{
  const local=parseLocalHealth(healthy())!;
  const status={source:"local-health",...local,capabilities:{status:true,preview:false,edit:false}};
  assert.equal(parseVisionHealthStatus(status)?.service.app_version,"1.2.3");
  assert.equal(parseVisionHealthStatus({...status,source:"synthetic"}),undefined);
  assert.equal(parseVisionHealthStatus({...status,model:"yolo11n"}),undefined);
  assert.equal(parseVisionHealthStatus({...status,capabilities:{status:true,preview:true,edit:false}}),undefined);
});
