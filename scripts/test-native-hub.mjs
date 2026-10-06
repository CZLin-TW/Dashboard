/** Built Next -> HB authority HTTP -> mini outbound WS -> native synthetic video. */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const dashboard=resolve(process.env.DASHBOARD_CHECKOUT||resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const floor=resolve(process.env.FLOOR_CHECKOUT||resolve(dashboard,'../floor-presence'));
const hb=resolve(process.env.HB_CHECKOUT||resolve(dashboard,'../../phase2-hb'));
const native=resolve(floor,'experiments/native-webrtc');
const wirePython=process.env.WIRE_PYTHON_BINARY||resolve(hb,'../phase2-venv/bin/python');
const python=process.env.PYTHON_BINARY, cache=process.env.PLAYWRIGHT_BROWSERS_PATH;
if(!python||!cache)throw Error('Existing PYTHON_BINARY and PLAYWRIGHT_BROWSERS_PATH required');
const require=createRequire(resolve(dashboard,'package.json'));
const {chromium}=require('playwright');
const {SignJWT}=await import(pathToFileURL(require.resolve('jose')).href);
const artifacts=resolve(dashboard,'artifacts/native-hub');await mkdir(artifacts,{recursive:true});
const temp=await mkdtemp(resolve(dashboard,'node_modules/.cache/native-hub-'));
const profile=resolve(native,'loopback-child.sb');
const children=[];
const evidence={scope:'two built Next instances -> one HB media authority -> outbound mini WebSocket -> native synthetic WebRTC',passed:false,checks:{},samples:[],realIPhone:false,externalSTUNTURN:false};
let activeCheck='prepare',browser,page,hubProcess,nativeProcess,connector,hubPort,media,cleanupTask;
const next=[{},{}];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const alive=p=>p&&p.exitCode===null&&p.signalCode===null;
const poll=async(fn,ms=10000)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){if(await fn())return;await delay(100)}throw Error('bounded condition timeout')};
const check=async(name,fn)=>{activeCheck=name;await fn();evidence.checks[name]=true;console.log(JSON.stringify({check:name,passed:true}))};
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const cleanEnv={PATH:process.env.PATH||'',TMPDIR:process.env.TMPDIR||'/tmp',PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1'};
function launch(role,args,cwd,env=cleanEnv,sandbox=profile,capture=false){
 const child=spawn('/usr/bin/sandbox-exec',['-f',sandbox,...args],{cwd,env,stdio:['ignore',capture?'pipe':'ignore','ignore']});
 child.fixtureRole=role;child.spawnError=false;child.on('error',()=>{child.spawnError=true});children.push(child);return child;
}
async function stop(child){if(!alive(child))return;const end=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([end,delay(4000)]);if(alive(child)){child.kill('SIGKILL');await end}}
async function cleanup(){return cleanupTask??=(async()=>{await browser?.close().catch(()=>{});await Promise.allSettled(children.map(stop));evidence.allOwnedProcessesStopped=children.every(p=>!alive(p))})()}
process.once('SIGTERM',async()=>{await cleanup();process.exit(124)});
const watchdog=setTimeout(()=>{void cleanup().then(()=>process.exit(124))},140000);
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port}
async function readyFile(path,child){let result;await poll(async()=>{if(!alive(child)||child.spawnError)throw Error(child.fixtureRole+' exited before ready');try{result=JSON.parse(await readFile(path,'utf8'));return true}catch{return false}},15000);return result}
async function startNative(){const ready=resolve(temp,'native-ready.json');await rm(ready,{force:true});nativeProcess=launch('native',[python,resolve(native,'run_server.py'),'--ready-file',ready,'--ttl','8','--idle','10','--lifetime','140'],native);media=(await readyFile(ready,nativeProcess)).url;assert.match(media,/^http:\/\/127\.0\.0\.1:\d+$/)}
async function startHub(fresh){const ready=resolve(temp,'hub-ready.json');await rm(ready,{force:true});await rm(resolve(temp,'hub-stop'),{force:true});hubProcess=launch('hub',[wirePython,resolve(hb,'scripts/vision_media_loopback_fixture.py'),'--ready-file',ready,'--stop-file',resolve(temp,'hub-stop'),'--revoke-file',resolve(temp,'revoke-alice'),'--port',String(hubPort||0),'--lifetime','140',...(fresh?['--fresh-native']:[])],hb);const value=await readyFile(ready,hubProcess);hubPort=Number(new URL(value.http_url).port)}
async function stopHub(){if(!alive(hubProcess))return;await writeFile(resolve(temp,'hub-stop'),'stop');await poll(()=>!alive(hubProcess),10000)}
async function startConnector(){connector=launch('connector',[wirePython,'-m','vision.media_outbound_fixture','--hub-port',String(hubPort),'--native-port',new URL(media).port,'--ttl','120'],floor,cleanEnv,profile,true);let received='',ready=false;connector.stdout.on('data',chunk=>{received=(received+chunk.toString()).slice(-4096);for(const line of received.split('\n')){try{if(JSON.parse(line).ready===true)ready=true}catch{}}});await poll(()=>{if(!alive(connector)||connector.spawnError)throw Error('connector exited before ready');return ready},10000)}
const secret='synthetic-native-dashboard-fixture-secret-only';
const token=id=>new SignJWT({lineUserId:id,name:'Synthetic fixture',role:'member'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('3m').sign(new TextEncoder().encode(secret));
const tokens={alice:await token('synthetic-alice'),bob:await token('synthetic-bob'),denied:await token('synthetic-denied')};
async function startNext(index,mode='test'){
 const item=next[index];item.port??=await freePort();item.origin=`http://localhost:${item.port}`;item.profile=resolve(temp,`next-${index}.sb`);
 // Actual bind remains 127. NextURL normalizes its URL origin to localhost.
 // Explicitly permit only HB + own HTTP ports, never the native sender HTTP port.
 await writeFile(item.profile,`(version 1)\n(allow default)\n(deny network*)\n(allow network-bind (local ip "localhost:${item.port}"))\n(allow network-inbound (local ip "localhost:${item.port}"))\n(allow network-outbound (remote ip "localhost:${item.port}"))\n(allow network-outbound (remote ip "localhost:${hubPort}"))\n(allow network-bind network-inbound network-outbound (local unix-socket))\n(allow network-outbound (remote unix-socket))\n`);
 const env={...cleanEnv,NODE_ENV:mode,NEXT_TELEMETRY_DISABLED:'1',SESSION_JWT_SECRET:secret,DASHBOARD_VISION_MEDIA_HUB_FIXTURE_MODE:'1',DASHBOARD_VISION_MEDIA_HUB_FIXTURE_PORT:String(hubPort),DASHBOARD_VISION_MEDIA_HUB_FIXTURE_TOKEN:'fixture-media-hub-service-public-only',DASHBOARD_VISION_GRANTS:JSON.stringify({'synthetic-alice':['preview'],'synthetic-bob':['preview'],'synthetic-denied':['status']})};
 item.process=launch('next-'+index,[process.execPath,resolve(dashboard,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(item.port)],dashboard,env,item.profile);
 await poll(async()=>{if(!alive(item.process))throw Error('Next exited before ready');try{return(await fetch(item.origin+'/api/vision/v1/access')).status===401}catch{return false}},20000);
}
const api=async(index,name,user='alice',body)=>fetch(`${next[index].origin}/api/vision/v1/media/${name}`,{method:body===undefined?'GET':'POST',headers:{...(user?{cookie:`dashboard_session=${tokens[user]}`} : {}),origin:next[index].origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const nativeState=async()=>{const response=await fetch(media+'/api/media/state',{headers:{authorization:'Bearer fixture-native-webrtc-public-only'}});assert.equal(response.status,200);return response.json()};
try{
 await startNative();await startHub(true);await startConnector();await startNext(0,'production');
 await check('production_auth_csrf_and_no_direct_native',async()=>{
  assert.equal((await api(0,'state')).status,503);
  const access=await fetch(next[0].origin+'/api/vision/v1/access',{headers:{cookie:`dashboard_session=${tokens.alice}`}});assert.notEqual((await access.json()).native_preview_available,true);
  await stop(next[0].process);await startNext(0);await startNext(1);
  assert.equal((await api(0,'state',null)).status,401);assert.equal((await api(1,'state','denied')).status,403);
  const csrf=await fetch(next[1].origin+'/api/vision/v1/media/offer',{method:'POST',headers:{cookie:`dashboard_session=${tokens.alice}`,'content-type':'application/json',origin:'http://localhost:1'},body:'{}'});assert.equal(csrf.status,403);
  const probe=launch('sandbox-proof',[process.execPath,'-e',`fetch(${JSON.stringify(media+'/api/media/state')}).then(()=>process.exit(1)).catch(()=>process.exit(0))`],dashboard,cleanEnv,next[0].profile);
  await poll(()=>!alive(probe));assert.equal(probe.exitCode,0);assert.equal((await nativeState()).active,false);evidence.dashboardNativeHttpDeniedBySandbox=true;
 });
 const wrapper=resolve(temp,'chromium-loopback');await writeFile(wrapper,`#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(profile)} ${quote(process.env.CHROMIUM_BINARY||resolve(cache,'chromium_headless_shell-1193/chrome-mac/headless_shell'))} "$@"\n`);await chmod(wrapper,0o700);
 browser=await chromium.launch({headless:true,executablePath:wrapper,args:['--allow-loopback-in-peer-connection','--disable-gpu','--disable-accelerated-video-decode','--disable-accelerated-video-encode','--disable-gpu-compositing','--disable-webrtc-hw-decoding','--disable-webrtc-hw-encoding','--disable-features=WebRtcHideLocalIpsWithMdns']});
 evidence.browser=browser.version();evidence.nextVersion=require('next/package.json').version;evidence.appVersion=require(resolve(dashboard,'package.json')).version;
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});let externalRequests=0;
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==next[0].origin){externalRequests++;return route.abort()}if(!/^\/(vision(?:[/?]|$)|_next\/|api\/vision\/|api\/auth\/me(?:[?]|$)|icons\/|favicon|manifest)/.test(url.pathname))return route.abort();return route.continue()});
 await context.addCookies([{name:'dashboard_session',value:tokens.alice,url:next[0].origin,httpOnly:true,sameSite:'Strict'}]);
 page=await context.newPage();await page.addInitScript(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{throw Error('Real device access prohibited')};const Original=window.RTCPeerConnection;window.__fixturePeers=[];window.RTCPeerConnection=new Proxy(Original,{construct(Target,args){const peer=new Target(...args);window.__fixturePeers.push(peer);return peer}})});
 let lease,lastOffer,offerCount=0,pageErrors=0;page.on('pageerror',()=>pageErrors++);page.on('request',request=>{if(request.url().endsWith('/media/offer')){lastOffer=request.postDataJSON();offerCount++}});page.on('response',async response=>{if(response.url().endsWith('/media/offer')&&response.status()===200){try{lease=await response.json()}catch{}}});
 const root=page.getByTestId('native-vision-preview');
 const snapshot=()=>root.evaluate(e=>({id:Number(e.dataset.nativeFrameId),advances:Number(e.dataset.nativeAdvances),fresh:e.dataset.nativeFresh,active:e.dataset.nativeActive}));
 const reload=()=>page.goto(next[0].origin+'/vision');
 const start=async()=>{lease=null;await page.getByRole('button',{name:'開始原生合成串流',exact:true}).click();await poll(async()=>Boolean(lease)&&(await snapshot()).advances>=3)};
 const stopUI=async()=>{await page.getByRole('button',{name:'停止原生預覽',exact:true}).click();await poll(async()=>!(await nativeState()).active)};
 await reload();
 await check('true_chain_decoded_synthetic_video',async()=>{
  await start();const before=await snapshot();await poll(async()=>(await snapshot()).id>before.id);const after=await snapshot();assert.equal(after.fresh,'true');
  const dimensions=await page.getByLabel('原生合成串流影像').evaluate(v=>[v.videoWidth,v.videoHeight]);assert.deepEqual(dimensions,[640,360]);
  const stats=await page.evaluate(async()=>{const peer=window.__fixturePeers.findLast(p=>p.connectionState==='connected');const all=await peer.getStats();let inbound,pair;all.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='video')inbound=s;if(s.type==='candidate-pair'&&s.nominated&&s.state==='succeeded')pair=s});const addresses=pair?[all.get(pair.localCandidateId)?.address,all.get(pair.remoteCandidateId)?.address]:[];return {codec:all.get(inbound.codecId)?.mimeType,framesDecoded:inbound.framesDecoded,bytesReceived:inbound.bytesReceived,loopback:addresses.length===2&&addresses.every(a=>a==='127.0.0.1'||a==='::1'),iceServers:peer.getConfiguration().iceServers.length}});
  assert.match(stats.codec,/VP8/);assert.equal(stats.loopback,true);assert.equal(stats.iceServers,0);assert(stats.framesDecoded>=3);evidence.samples.push({before,after,dimensions,stats});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({fullPage:true,path:resolve(artifacts,'portrait-synthetic.png')});
 });
 await check('two_dashboards_share_viewer_and_isolate_actor',async()=>{
  assert.equal((await(await api(1,'state')).json()).active,true);assert.equal((await(await api(1,'state','bob')).json()).active,false);
  assert.equal((await api(1,'heartbeat','alice',{session_id:lease.session_id,visible:true})).status,200);
  const busy=await api(1,'offer','bob',lastOffer);assert.equal(busy.status,409);assert.equal((await busy.json()).code,'media_viewer_busy');
  assert.equal((await api(1,'heartbeat','bob',{session_id:lease.session_id,visible:true})).status,404);assert.equal((await api(1,'stop','bob',{session_id:lease.session_id})).status,404);
  const old=lease.session_id;assert.equal((await api(1,'stop','alice',{session_id:old})).status,200);await poll(async()=>!(await nativeState()).active);assert.equal((await api(0,'stop','alice',{session_id:old})).status,200);await reload();
 });
 await check('dashboard_restart_preserves_hb_lease',async()=>{
  await start();await stop(next[0].process);assert.equal((await(await api(1,'state')).json()).active,true);assert.equal((await api(1,'heartbeat','alice',{session_id:lease.session_id,visible:true})).status,200);await startNext(0);assert.equal((await(await api(0,'state')).json()).active,true);await stopUI();await page.setViewportSize({width:844,height:390});await start();await page.screenshot({fullPage:true,path:resolve(artifacts,'landscape-synthetic.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await stopUI();
 });
 await check('ttl_stops_native_without_automatic_retry',async()=>{await start();const count=offerCount;await poll(async()=>!(await nativeState()).active,12000);await delay(700);assert.equal(offerCount,count);assert.notEqual((await snapshot()).active,'true');assert.equal((await(await api(1,'state')).json()).active,false)});
 await check('hb_actor_revocation_cleans_active_lease',async()=>{await start();await writeFile(resolve(temp,'revoke-alice'),'revoke synthetic alice');await poll(async()=>(await api(1,'state')).status===403,3000);await poll(async()=>!(await nativeState()).active,5000);assert.equal((await api(0,'heartbeat','alice',{session_id:lease.session_id,visible:true})).status,403);await context.clearCookies();await context.addCookies([{name:'dashboard_session',value:tokens.bob,url:next[0].origin,httpOnly:true,sameSite:'Strict'}]);await reload()});
 await check('outbound_ws_loss_stops_native_and_quarantines',async()=>{await start();const id=lease.session_id;await stop(connector);await poll(async()=>!(await nativeState()).active,12000);assert.equal((await api(1,'heartbeat','bob',{session_id:id,visible:true})).status,404);const denied=await api(1,'offer','bob',lastOffer);assert.equal(denied.status,503);assert.equal((await denied.json()).code,'media_result_unknown')});
 await check('hb_restart_quarantines_without_bypass',async()=>{
  // A separate fresh native process permits a fresh first-launch HB fixture only.
  await stopHub();await stop(nativeProcess);await rm(resolve(temp,'revoke-alice'),{force:true});await startNative();await startHub(true);await startConnector();await context.clearCookies();await context.addCookies([{name:'dashboard_session',value:tokens.alice,url:next[0].origin,httpOnly:true,sameSite:'Strict'}]);await reload();await start();const id=lease.session_id;
  await stopHub();await stop(connector);await startHub(false);await startConnector();assert.equal((await(await api(1,'state')).json()).active,false);assert.equal((await api(1,'heartbeat','alice',{session_id:id,visible:true})).status,404);const unknown=await api(0,'offer','alice',lastOffer);assert.equal(unknown.status,503);assert.equal((await unknown.json()).code,'media_result_unknown');await poll(async()=>!(await nativeState()).active,12000);evidence.restartScope='fresh-native flag only with newly spawned native; actual HB restart retains 67s unknown quarantine, not waited out';
 });
 await check('browser_clean_and_no_external_network',async()=>{assert.equal(pageErrors,0);assert.equal(externalRequests,0);evidence.externalRequestAttempts=externalRequests});
 evidence.passed=true;evidence.mobileScope='Chromium touch emulation only, not real iPhone or WebKit';
}catch(error){evidence.failedCheck=activeCheck;evidence.error='bounded_native_hub_integration_failed';console.error(`Failed check: ${activeCheck}; ${error.name}; ${String(error.message).split('\n')[0].slice(0,200)}`);await page?.screenshot({fullPage:true,path:resolve(artifacts,'failure-synthetic.png')}).catch(()=>{});process.exitCode=1}
finally{clearTimeout(watchdog);await cleanup();await rm(temp,{recursive:true,force:true});await writeFile(resolve(artifacts,'verification.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,checks:evidence.checks,failedCheck:evidence.failedCheck,allOwnedProcessesStopped:evidence.allOwnedProcessesStopped}));}
