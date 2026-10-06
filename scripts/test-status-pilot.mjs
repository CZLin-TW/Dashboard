/** Real verified TLS status-only pilot, temporary CA/SQLite/fake credentials only. */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, chmod, realpath, rename, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
const evidence={scope:'existing JWT + household API key -> verified HB HTTPS/authoritative fake Sheets snapshot -> dedicated outbound WSS device',passed:false,checks:{},temporaryCAOnly:true,trustStoreChanged:false,camera:false,media:false};
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
const service='fixture-existing-home-butler-family-key-public-only';
const device='fixture-status-pilot-device-public-only-000000001';
const expiry=Math.floor(Date.now()/1000)+180;
const user='synthetic-status-member';
let revision=0;
const snapshot={members:[{'Line User ID':user,'狀態':'啟用'}],grants:[{user_id:user,status:true,preview:true,edit:true}],devices:[{record_id:'synthetic-device',digest:createHash('sha256').update(device).digest('hex'),device_id:'floor-mini-01',scopes:['status'],expires_at:expiry,revoked:false}]};
async function atomic(path,value){const pending=path+'.pending';await writeFile(pending,JSON.stringify(value),{mode:0o600});await rename(pending,path)}
async function refresh(control={}){await atomic(files('snapshot.json'),snapshot);revision++;await atomic(files('control.json'),{revision,...control});await poll(async()=>(await counts('good')).refresh_revision===revision)}
async function openssl(...args){await command('openssl',['/usr/bin/openssl',...args])}
async function cert(name,san){await openssl('req','-new','-newkey','rsa:2048','-nodes','-keyout',files(name+'.key'),'-out',files(name+'.csr'),'-subj','/CN='+name);await writeFile(files(name+'.ext'),`basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`,{mode:0o600});await openssl('x509','-req','-in',files(name+'.csr'),'-CA',files('ca.pem'),'-CAkey',files('ca.key'),'-CAcreateserial','-out',files(name+'.pem'),'-days','1','-extfile',files(name+'.ext'))}
async function startHB(name,enabled,certName='server'){
 const value=servers[name]??={};value.ready=files(name+'-ready.json');value.stats=files(name+'-stats.json');value.stop=files(name+'-stop');await rm(value.ready,{force:true});await rm(value.stop,{force:true});
 value.process=launch('hb-'+name,[python,resolve(dashboard,'scripts/status-pilot-tls-fixture.py'),'--hb-checkout',hb,'--snapshot-file',files('snapshot.json'),'--control-file',files('control.json'),'--family-key-file',files('family.raw'),'--cert',files(certName+'.pem'),'--key',files(certName+'.key'),'--ready-file',value.ready,'--stats-file',value.stats,'--stop-file',value.stop,'--port',String(value.port||0),'--lifetime','120',...(enabled?['--enabled']:[])]);
 await poll(async()=>{if(!alive(value.process))throw Error('HB TLS fixture exited');try{const ready=JSON.parse(await readFile(value.ready,'utf8'));value.port=ready.port;assert.equal(ready.enabled,enabled);return true}catch{return false}},12000);return value;
}
async function stopHB(name){const value=servers[name];if(!alive(value?.process))return;await writeFile(value.stop,'stop');await poll(()=>!alive(value.process),8000)}
async function counts(name){let result;await poll(async()=>{try{result=JSON.parse(await readFile(servers[name].stats,'utf8'));return true}catch{return false}},1000);return result}
async function tls(port,{ca='ca.pem',servername='localhost',body,token=service,actor=user,role='member',sessionExpiry=expiry,extraHeaders={},path='/api/vision/v1/command',method='POST'}={}){
 const authority=await readFile(files(ca));return new Promise(resolve=>{
  const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));const req=httpsRequest({hostname:'127.0.0.1',port,servername,ca:authority,rejectUnauthorized:true,method,path,agent:false,headers:{'content-type':'application/json','X-API-Key':token,'X-Dashboard-User':actor,'X-Dashboard-Role':role,'X-Dashboard-Session-Expires':String(sessionExpiry),...extraHeaders,...(bytes?{'content-length':bytes.length}:{})}},res=>{let raw='';res.on('data',c=>{raw+=c;if(raw.length>32768)req.destroy()});res.on('end',()=>{let body;try{body=JSON.parse(raw)}catch{};resolve({status:res.statusCode,body})})});req.setTimeout(3000,()=>req.destroy());req.on('error',error=>resolve({tlsError:error.code||'request_failed'}));req.end(bytes);
 })
}
const payload=(action='status.get',value={})=>({protocol:'vision.v1',type:'command',request_id:randomUUID(),device_id:'floor-mini-01',action,deadline:Date.now()/1000+5,payload:value});
async function floorClient(port,ca='ca.pem',file='device.json',expectReady=true){const p=launch('floor-wss',[python,'-m','vision.status_pilot','--credential-file',files(file),'--fixture-port',String(port),'--fixture-ca',files(ca),'--lifetime','120'],floor);if(expectReady){await poll(()=>{if(!alive(p))throw Error('floor WSS exited before ready');return p.safeOutput.includes('"ready": true')},6000)}else{await poll(()=>!alive(p),6000);assert(!p.safeOutput.includes('"ready": true'))}return p}
const secret='fixture-status-pilot-dashboard-jwt-public-only';
const jwt=await new SignJWT({lineUserId:'synthetic-status-member',name:'Synthetic fixture',role:'member'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('3m').sign(new TextEncoder().encode(secret));
const deniedJwt=await new SignJWT({lineUserId:'synthetic-status-denied',role:'member'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('3m').sign(new TextEncoder().encode(secret));
let nextPort,origin;
async function startNext({enabled=true,mode='test',ca='ca.pem',port=servers.good.port,familyKey=service}={}){
 await stop(next);nextPort??=await freePort();origin=`http://localhost:${nextPort}`;
 const env={...cleanEnv,NODE_ENV:mode,NEXT_TELEMETRY_DISABLED:'1',SESSION_JWT_SECRET:secret,HOME_BUTLER_API_KEY:familyKey,DASHBOARD_VISION_PILOT_TLS_FIXTURE_PORT:String(port),DASHBOARD_VISION_PILOT_TLS_FIXTURE_CA:files(ca),...(enabled?{DASHBOARD_VISION_STATUS_PILOT:'1'}:{})};
 next=launch('next-status',[process.execPath,resolve(dashboard,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(nextPort)],dashboard,env);
 await poll(async()=>{if(!alive(next))throw Error('Next exited before ready');try{return(await fetch(origin+'/api/vision/v1/status')).status===401}catch{return false}},15000)
}
const api=async(path='status',method='GET',body,session=jwt)=>fetch(origin+'/api/vision/v1/'+path,{method,headers:{...(session?{cookie:'dashboard_session='+session}:{}),origin,'content-type':'application/json','X-API-Key':'client-spoof','X-Dashboard-User':'mallory','X-Dashboard-Role':'kid','X-Dashboard-Session-Expires':'9999999999'},...(body===undefined?{}:{body:JSON.stringify(body)})});
try{
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout',files('ca.key'),'-out',files('ca.pem'),'-days','1','-subj','/CN=StatusPilotFixtureCA');
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout',files('wrong-ca.key'),'-out',files('wrong-ca.pem'),'-days','1','-subj','/CN=UntrustedStatusFixtureCA');
 await cert('server','DNS:localhost,IP:127.0.0.1');await cert('wrong-host','DNS:wrong.invalid');
 await writeFile(files('family.raw'),service,{mode:0o600});await writeFile(files('device.json'),JSON.stringify({token:device,device_id:'floor-mini-01',expires_at:expiry}),{mode:0o600});await atomic(files('snapshot.json'),snapshot);await atomic(files('control.json'),{revision:0});
 await check('fake_sheets_only_no_second_service_registry_default_off',async()=>{await startHB('good',false);assert.equal((await tls(servers.good.port,{body:payload()})).status,404);await stopHB('good');await startHB('good',true);await startHB('bad',false,'wrong-host');evidence.sqliteRequired=false;evidence.secondVisionServiceCredential=false;evidence.dashboardLocalGrantRequired=false});
 await check('default_off_auth_kid_and_verified_identity_not_client_headers',async()=>{await startNext({enabled:false});assert.notEqual((await api()).status,200);await startNext({mode:'production'});assert.equal((await api()).status,503);await startNext();assert.equal((await api('status','GET',undefined,null)).status,401);assert.equal((await api('status','GET',undefined,deniedJwt)).status,403);const kid=await new SignJWT({lineUserId:user,role:'kid'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1m').sign(new TextEncoder().encode(secret));const before=await counts('good');assert.equal((await api('access','GET',undefined,kid)).status,403);assert.deepEqual(await counts('good'),before);assert.equal((await api('access')).status,200)});
 await check('verified_https_wss_status_uses_shared_snapshot_without_heartbeat_reads',async()=>{connector=await floorClient(servers.good.port);const before=(await counts('good')).reader_calls;for(let i=0;i<4;i++){const response=await api();assert.equal(response.status,200);const value=await response.json();assert.equal(value.source,'synthetic');assert.equal(value.online,true);assert.deepEqual(value.capabilities,{status:true,preview:false,edit:false});evidence.status={source:value.source,online:value.online,reason:value.reason,capabilities:value.capabilities}}assert.equal((await counts('good')).reader_calls,before);evidence.verifiedWssReady=true;evidence.snapshotReusedForRepeatedRequests=true});
 await check('writes_media_and_untrusted_hb_actor_headers_denied',async()=>{
  for(const [action,body] of [['config.get',{}],['detector.configure',{expected_revision:0,model:'yolo11n',precision:'fp32'}]]){const response=await tls(servers.good.port,{body:payload(action,body)});assert.equal(response.status,403)}
  assert.notEqual((await tls(servers.good.port,{body:payload('media.offer',{})})).status,200);
  for(const options of [{role:'kid'},{actor:'mallory'},{sessionExpiry:1},{extraHeaders:{'X-Dashboard-User':[user,'mallory']}}])assert.equal((await tls(servers.good.port,{body:payload(),...options})).status,403);
  assert.equal((await api('config')).status,403);assert.equal((await api('config','PUT',{revision:0,model:'yolo11n',precision:'fp32'})).status,403);assert.equal((await api('media/offer','POST',{})).status,403);
 });
 await check('https_and_wss_wrong_ca_hostname_fail_before_application',async()=>{
  let before=await counts('good');await startNext({ca:'wrong-ca.pem'});assert.equal((await api()).status,503);assert.deepEqual(await counts('good'),before);
  const beforeBad=await counts('bad');await startNext({port:servers.bad.port});assert.equal((await api()).status,503);assert.deepEqual(await counts('bad'),beforeBad);
  const wrongCA=await tls(servers.good.port,{ca:'wrong-ca.pem',body:payload()});const wrongHost=await tls(servers.bad.port,{body:payload()});assert(wrongCA.tlsError);assert(wrongHost.tlsError);evidence.tlsRejections={wrongCA:wrongCA.tlsError,wrongHostname:wrongHost.tlsError};
  await stop(connector);before=await counts('good');await floorClient(servers.good.port,'wrong-ca.pem','device.json',false);assert.deepEqual(await counts('good'),before);before=await counts('bad');await floorClient(servers.bad.port,'ca.pem','device.json',false);assert.deepEqual(await counts('bad'),before);connector=await floorClient(servers.good.port);await startNext();assert.equal((await api()).status,200);
 });
 await check('failed_snapshot_refresh_denies_prior_allow',async()=>{await refresh({fail:true});assert.equal((await api('access')).status,503);await poll(()=>!alive(connector),5000);await refresh();connector=await floorClient(servers.good.port);assert.equal((await api()).status,200)});
 await check('late_status_response_rechecks_current_hb_grant',async()=>{await atomic(files('control.json'),{revision,hold:true});const pending=api();await poll(async()=>(await counts('good')).command_waiting);snapshot.grants[0].status=false;await refresh({hold:true});await atomic(files('control.json'),{revision,hold:false});const response=await pending;assert.equal(response.status,403);assert.equal((await response.json()).source,undefined);snapshot.grants[0].status=true;await refresh();assert.equal((await api()).status,200);evidence.lateResponseScope='authority HTTP response held while fake snapshot is refreshed; BFF rechecks grant before delivery'});
 await check('membership_and_device_revocation_survive_snapshot_reload',async()=>{snapshot.members[0]['狀態']='停用';await refresh();assert.equal((await api('access')).status,403);await stop(connector);await stopHB('good');await startHB('good',true);assert.equal((await api('access')).status,403);snapshot.members[0]['狀態']='啟用';await refresh();connector=await floorClient(servers.good.port);snapshot.devices[0].revoked=true;await refresh();await poll(()=>!alive(connector),5000);await stopHB('good');await startHB('good',true);await floorClient(servers.good.port,'ca.pem','device.json',false)});
 await check('family_server_key_cannot_authenticate_native_device',async()=>{snapshot.devices.push({record_id:'accidental-family-key',digest:createHash('sha256').update(service).digest('hex'),device_id:'floor-mini-01',scopes:['status'],expires_at:expiry,revoked:false});await refresh();await writeFile(files('family-device.json'),JSON.stringify({token:service,device_id:'floor-mini-01',expires_at:expiry}),{mode:0o600});await floorClient(servers.good.port,'ca.pem','family-device.json',false)});
 await check('bad_device_file_and_missing_household_key_fail_without_network',async()=>{const before=await counts('good');await chmod(files('device.json'),0o644);await floorClient(servers.good.port,'ca.pem','device.json',false);await chmod(files('device.json'),0o600);await writeFile(files('device.json'),JSON.stringify({token:device,device_id:'floor-mini-01',expires_at:1}),{mode:0o600});await floorClient(servers.good.port,'ca.pem','device.json',false);await startNext({familyKey:''});assert.equal((await api()).status,503);assert.deepEqual(await counts('good'),before)});
 evidence.passed=true;evidence.appVersion=require(resolve(dashboard,'package.json')).version;evidence.nextVersion=require('next/package.json').version;evidence.limitations='temporary CA + fake Sheets rows + fake existing household key only; no real Sheets, Keychain, production endpoint, camera, deployment or trust-store changes';
}catch(error){evidence.failedCheck=activeCheck;evidence.error='status_pilot_integration_failed';if(error.name==='AssertionError'&&['number','boolean','string'].includes(typeof error.actual))evidence.assertion={actual:error.actual,expected:error.expected};console.error(`Failed check: ${activeCheck}; ${error.name}; ${String(error.message).split('\n')[0].slice(0,150)}`);process.exitCode=1}
finally{clearTimeout(watchdog);await cleanup();await rm(temp,{recursive:true,force:true});evidence.temporaryPrivateMaterialRemoved=true;await writeFile(resolve(artifacts,'verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,checks:evidence.checks,failedCheck:evidence.failedCheck,allOwnedProcessesStopped:evidence.allOwnedProcessesStopped,temporaryPrivateMaterialRemoved:true}));}
