/** Real verified TLS status-only pilot, temporary CA/SQLite/fake credentials only. */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, chmod, stat, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const dashboard=resolve(process.env.DASHBOARD_CHECKOUT||resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const floor=resolve(process.env.FLOOR_CHECKOUT||resolve(dashboard,'../floor-presence'));
const hb=resolve(process.env.HB_CHECKOUT||resolve(dashboard,'../../phase2-hb'));
const python=process.env.WIRE_PYTHON_BINARY||process.env.PYTHON_BINARY||resolve(hb,'../phase2-venv/bin/python');
const profile=resolve(floor,'experiments/native-webrtc/loopback-child.sb');
const require=createRequire(resolve(dashboard,'package.json'));
const {SignJWT}=await import(pathToFileURL(require.resolve('jose')).href);
const artifacts=resolve(dashboard,'artifacts/status-pilot');await mkdir(artifacts,{recursive:true});
const temp=await realpath(await mkdtemp(resolve(dashboard,'node_modules/.cache/status-pilot-')));await chmod(temp,0o700);
const children=[], servers={};let next,connector,activeCheck='prepare',cleanupTask;
const evidence={scope:'built Next HTTPS BFF -> real HB status-only installer + persistent SQLite -> verified outbound WSS floor client',passed:false,checks:{},temporaryCAOnly:true,trustStoreChanged:false,camera:false,media:false};
const cleanEnv={PATH:process.env.PATH||'',TMPDIR:process.env.TMPDIR||'/tmp',PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1'};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const alive=p=>p&&!p.spawnFailed&&p.exitCode===null&&p.signalCode===null;
const poll=async(fn,ms=10000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await delay(50)}throw Error('bounded condition timeout')};
const check=async(name,fn)=>{activeCheck=name;await fn();evidence.checks[name]=true;console.log(JSON.stringify({check:name,passed:true}))};
function launch(role,args,cwd=dashboard,env=cleanEnv){const p=spawn('/usr/bin/sandbox-exec',['-f',profile,...args],{cwd,env,stdio:['ignore','pipe','ignore']});p.safeOutput='';p.on('error',()=>{p.spawnFailed=true});p.stdout.on('data',chunk=>{p.safeOutput=(p.safeOutput+chunk.toString()).slice(-4096)});children.push(p);p.fixtureRole=role;return p}
async function stop(p){if(!alive(p))return;const end=new Promise(r=>p.once('exit',r));p.kill('SIGTERM');await Promise.race([end,delay(4000)]);if(alive(p)){p.kill('SIGKILL');await end}}
async function cleanup(){return cleanupTask??=(async()=>{await Promise.allSettled(children.map(stop));evidence.allOwnedProcessesStopped=children.every(p=>!alive(p))})()}
process.once('SIGTERM',async()=>{await cleanup();process.exit(124)});
const watchdog=setTimeout(()=>{void cleanup().then(()=>process.exit(124))},140000);
async function command(role,args,cwd=temp){const p=launch(role,args,cwd);await poll(()=>!alive(p),15000);if(p.exitCode!==0)throw Error(role+' failed');return p}
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port}
const files=name=>resolve(temp,name);
const service='fixture-status-pilot-service-public-only-00000001';
const device='fixture-status-pilot-device-public-only-000000001';
const expiry=Math.floor(Date.now()/1000)+180;
const db=files('registry.sqlite');
const registry=(...args)=>command('registry',[python,resolve(hb,'scripts/vision_status_registry.py'),...args],hb);
async function openssl(...args){await command('openssl',['/usr/bin/openssl',...args])}
async function cert(name,san){await openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout',files(name+'.key'),'-out',files(name+'.csr'),'-subj','/CN='+name);await writeFile(files(name+'.ext'),`basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`,{mode:0o600});await openssl('x509','-req','-in',files(name+'.csr'),'-CA',files('ca.pem'),'-CAkey',files('ca.key'),'-CAcreateserial','-out',files(name+'.pem'),'-days','1','-extfile',files(name+'.ext'))}
async function startHB(name,enabled,certName='server'){
 const value=servers[name]??={};value.ready=files(name+'-ready.json');value.stats=files(name+'-stats.json');value.stop=files(name+'-stop');await rm(value.ready,{force:true});await rm(value.stop,{force:true});
 value.process=launch('hb-'+name,[python,resolve(dashboard,'scripts/status-pilot-tls-fixture.py'),'--hb-checkout',hb,'--db',db,'--cert',files(certName+'.pem'),'--key',files(certName+'.key'),'--ready-file',value.ready,'--stats-file',value.stats,'--stop-file',value.stop,'--port',String(value.port||0),'--lifetime','120',...(enabled?['--enabled']:[])]);
 await poll(async()=>{if(!alive(value.process))throw Error('HB TLS fixture exited');try{const ready=JSON.parse(await readFile(value.ready,'utf8'));value.port=ready.port;assert.equal(ready.enabled,enabled);return true}catch{return false}},12000);return value;
}
async function stopHB(name){const value=servers[name];if(!alive(value?.process))return;await writeFile(value.stop,'stop');await poll(()=>!alive(value.process),8000)}
async function counts(name){let result;await poll(async()=>{try{result=JSON.parse(await readFile(servers[name].stats,'utf8'));return true}catch{return false}},1000);return result}
async function tls(port,{ca='ca.pem',servername='localhost',body,token=service,path='/api/vision/v1/command',method='POST'}={}){
 const authority=await readFile(files(ca));return new Promise(resolve=>{
  const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));const req=httpsRequest({hostname:'127.0.0.1',port,servername,ca:authority,rejectUnauthorized:true,method,path,agent:false,headers:{'content-type':'application/json',authorization:'Bearer '+token,...(bytes?{'content-length':bytes.length}:{})}},res=>{let raw='';res.on('data',c=>{raw+=c;if(raw.length>32768)req.destroy()});res.on('end',()=>{let body;try{body=JSON.parse(raw)}catch{};resolve({status:res.statusCode,body})})});req.setTimeout(3000,()=>req.destroy());req.on('error',error=>resolve({tlsError:error.code||'request_failed'}));req.end(bytes);
 })
}
const payload=(action='status.get',value={})=>({protocol:'vision.v1',type:'command',request_id:randomUUID(),device_id:'floor-mini-01',action,deadline:Date.now()/1000+5,payload:value});
async function floorClient(port,ca='ca.pem',file='device.json',expectReady=true){const p=launch('floor-wss',[python,'-m','vision.status_pilot','--credential-file',files(file),'--fixture-port',String(port),'--fixture-ca',files(ca),'--lifetime','120'],floor);if(expectReady){await poll(()=>{if(!alive(p))throw Error('floor WSS exited before ready');return p.safeOutput.includes('"ready": true')},6000)}else{await poll(()=>!alive(p),6000);assert(!p.safeOutput.includes('"ready": true'))}return p}
const secret='fixture-status-pilot-dashboard-jwt-public-only';
const jwt=await new SignJWT({lineUserId:'synthetic-status-member',name:'Synthetic fixture',role:'member'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('3m').sign(new TextEncoder().encode(secret));
const deniedJwt=await new SignJWT({lineUserId:'synthetic-status-denied',role:'member'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('3m').sign(new TextEncoder().encode(secret));
let nextPort,origin;
async function startNext({enabled=true,mode='test',ca='ca.pem',port=servers.good.port,expires=expiry}={}){
 await stop(next);nextPort??=await freePort();origin=`http://localhost:${nextPort}`;
 const env={...cleanEnv,NODE_ENV:mode,NEXT_TELEMETRY_DISABLED:'1',SESSION_JWT_SECRET:secret,DASHBOARD_VISION_GRANTS:JSON.stringify({'synthetic-status-member':['status','preview','edit']}),DASHBOARD_VISION_PILOT_SERVICE_TOKEN:service,DASHBOARD_VISION_PILOT_EXPIRES_AT:String(expires),DASHBOARD_VISION_PILOT_TLS_FIXTURE_PORT:String(port),DASHBOARD_VISION_PILOT_TLS_FIXTURE_CA:files(ca),...(enabled?{DASHBOARD_VISION_STATUS_PILOT:'1'}:{})};
 next=launch('next-status',[process.execPath,resolve(dashboard,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(nextPort)],dashboard,env);
 await poll(async()=>{if(!alive(next))throw Error('Next exited before ready');try{return(await fetch(origin+'/api/vision/v1/status')).status===401}catch{return false}},15000)
}
const api=async(path='status',method='GET',body,session=jwt)=>fetch(origin+'/api/vision/v1/'+path,{method,headers:{...(session?{cookie:'dashboard_session='+session}:{}),origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
try{
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout',files('ca.key'),'-out',files('ca.pem'),'-days','1','-subj','/CN=StatusPilotFixtureCA');
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout',files('wrong-ca.key'),'-out',files('wrong-ca.pem'),'-days','1','-subj','/CN=UntrustedStatusFixtureCA');
 await cert('server','DNS:localhost,IP:127.0.0.1');await cert('wrong-host','DNS:wrong.invalid');
 await writeFile(files('service.raw'),service,{mode:0o600});await writeFile(files('device.raw'),device,{mode:0o600});await writeFile(files('device.json'),JSON.stringify({token:device,device_id:'floor-mini-01',expires_at:expiry}),{mode:0o600});
 await registry('init','--db',db);for(const [kind,tokenFile] of [['service','service.raw'],['device','device.raw']])await registry('enroll','--db',db,'--record-id','synthetic-'+kind,'--kind',kind,'--device-id','floor-mini-01','--expires-at',String(expiry),'--secret-file',files(tokenFile));
 await check('private_digest_registry_and_default_off_installer',async()=>{assert.equal((await stat(db)).mode&0o777,0o600);const raw=await readFile(db);assert(!raw.includes(Buffer.from(service)));assert(!raw.includes(Buffer.from(device)));await startHB('good',false);assert.equal((await tls(servers.good.port,{body:payload()})).status,404);await stopHB('good');await startHB('good',true);await startHB('bad',false,'wrong-host')});
 await check('dashboard_default_off_production_guard_and_auth',async()=>{await startNext({enabled:false});assert.equal((await api()).status,503);await startNext({mode:'production'});assert.equal((await api()).status,503);assert.equal((await api('status','GET',undefined,null)).status,401);assert.equal((await api('status','GET',undefined,deniedJwt)).status,403)});
 await check('verified_https_and_wss_status_chain',async()=>{connector=await floorClient(servers.good.port);await startNext();const response=await api();assert.equal(response.status,200);const value=await response.json();assert.equal(value.source,'synthetic');assert.equal(value.online,true);assert.equal(value.capabilities.status,true);assert.equal(value.capabilities.preview,false);assert.equal(value.capabilities.edit,false);evidence.status={source:value.source,online:value.online,reason:value.reason,capabilities:value.capabilities};evidence.verifiedWssReady=true});
 await check('configuration_writes_media_and_other_actions_denied',async()=>{
  for(const [action,body] of [['config.get',{}],['detector.configure',{expected_revision:0,model:'yolo11n',precision:'fp32'}]]){const response=await tls(servers.good.port,{body:payload(action,body)});assert.equal(response.status,403);assert.equal(response.body.code,'status_only_pilot')}
  const unknown=await tls(servers.good.port,{body:payload('media.offer',{})});assert.notEqual(unknown.status,200);
  assert.equal((await api('config')).status,403);assert.equal((await api('config','PUT',{revision:0,model:'yolo11n',precision:'fp32'})).status,403);assert.equal((await api('media/offer','POST',{})).status,403);
 });
 await check('https_wrong_ca_and_hostname_fail_before_application',async()=>{
  const before=await counts('good');await startNext({ca:'wrong-ca.pem'});assert.equal((await api()).status,503);assert.deepEqual(await counts('good'),before);
  const beforeBad=await counts('bad');await startNext({port:servers.bad.port});assert.equal((await api()).status,503);assert.deepEqual(await counts('bad'),beforeBad);
  const wrongCA=await tls(servers.good.port,{ca:'wrong-ca.pem',body:payload()});const wrongHost=await tls(servers.bad.port,{body:payload()});assert(wrongCA.tlsError);assert(wrongHost.tlsError);evidence.tlsRejections={wrongCA:wrongCA.tlsError,wrongHostname:wrongHost.tlsError};
 });
 await check('wss_wrong_ca_and_hostname_fail_before_application',async()=>{await stop(connector);let before=await counts('good');await floorClient(servers.good.port,'wrong-ca.pem','device.json',false);assert.deepEqual(await counts('good'),before);before=await counts('bad');await floorClient(servers.bad.port,'ca.pem','device.json',false);assert.deepEqual(await counts('bad'),before);connector=await floorClient(servers.good.port);await startNext();assert.equal((await api()).status,200)});
 await check('service_revocation_survives_authority_restart',async()=>{await registry('revoke','--db',db,'--record-id','synthetic-service');assert.equal((await api()).status,503);await stop(connector);await stopHB('good');await startHB('good',true);connector=await floorClient(servers.good.port);assert.equal((await api()).status,503);const denied=await tls(servers.good.port,{body:payload()});assert.equal(denied.status,403);assert.equal(denied.body.code,'forbidden')});
 await check('device_revocation_survives_authority_restart',async()=>{await registry('revoke','--db',db,'--record-id','synthetic-device');await poll(()=>!alive(connector),5000);await stopHB('good');await startHB('good',true);await floorClient(servers.good.port,'ca.pem','device.json',false)});
 await check('invalid_file_and_expired_provider_fail_without_network',async()=>{const before=await counts('good');await chmod(files('device.json'),0o644);await floorClient(servers.good.port,'ca.pem','device.json',false);await chmod(files('device.json'),0o600);await writeFile(files('device.json'),JSON.stringify({token:device,device_id:'floor-mini-01',expires_at:1}),{mode:0o600});await floorClient(servers.good.port,'ca.pem','device.json',false);await startNext({expires:1});assert.equal((await api()).status,503);assert.deepEqual(await counts('good'),before)});
 evidence.passed=true;evidence.appVersion=require(resolve(dashboard,'package.json')).version;evidence.nextVersion=require('next/package.json').version;evidence.limitations='temporary local CA and fake credentials only; no hosted secrets, production endpoint, camera, media, deployment, or trust-store changes';
}catch(error){evidence.failedCheck=activeCheck;evidence.error='status_pilot_integration_failed';if(error.name==='AssertionError'&&['number','boolean','string'].includes(typeof error.actual))evidence.assertion={actual:error.actual,expected:error.expected};console.error(`Failed check: ${activeCheck}; ${error.name}; ${String(error.message).split('\n')[0].slice(0,150)}`);process.exitCode=1}
finally{clearTimeout(watchdog);await cleanup();await rm(temp,{recursive:true,force:true});evidence.temporaryPrivateMaterialRemoved=true;await writeFile(resolve(artifacts,'verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,checks:evidence.checks,failedCheck:evidence.failedCheck,allOwnedProcessesStopped:evidence.allOwnedProcessesStopped,temporaryPrivateMaterialRemoved:true}));}
