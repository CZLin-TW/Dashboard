/** Status-only pilot. Inert by default; no camera/config/edit/media operations.
 * Production credentials belong to server hosting secrets, never browser config.
 */
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { VisionHTTPError } from "./vision-http";
import type { VisionCapabilities, VisionStatus } from "./vision-contract";
export interface PilotCredential { token: string; expiresAt: number }
export interface PilotCredentialProvider { read(): PilotCredential | undefined }
const DEVICE = "floor-mini-01";
const HOST = "home-butler.onrender.com";
const fail = () => new VisionHTTPError(503, "vision_pilot_unavailable");
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join() === expected.sort().join();
export function environmentPilotCredential(env: Record<string, string | undefined>): PilotCredentialProvider {
  return {read() {
    const token = env.DASHBOARD_VISION_PILOT_SERVICE_TOKEN;
    const expiry = env.DASHBOARD_VISION_PILOT_EXPIRES_AT;
    if (!token || !/^[\x21-\x7e]{32,512}$/.test(token) || !expiry || !/^\d+(?:\.\d+)?$/.test(expiry)) return;
    const expiresAt = Number(expiry)*1000;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    return {token, expiresAt};
  }};
}
function transport(provider: PilotCredentialProvider, host: string, port: number, servername: string, ca?: string) {
  return {async status(capabilities: VisionCapabilities, signal?: AbortSignal): Promise<VisionStatus> {
    const credential = provider.read();
    if (!credential || !/^[\x21-\x7e]{32,512}$/.test(credential.token) || !Number.isFinite(credential.expiresAt) || credential.expiresAt <= Date.now() || signal?.aborted) throw fail();
    const id = randomUUID();
    const deadline = Math.min(Date.now()+7000, credential.expiresAt);
    const monotonicDeadline = performance.now() + Math.max(0, deadline-Date.now());
    const bytes = Buffer.from(JSON.stringify({protocol:"vision.v1", type:"command", request_id:id, device_id:DEVICE, action:"status.get", deadline:deadline/1000, payload:{}}));
    const result: unknown = await new Promise((resolve, reject) => {
      let done = false;
      const finish = (error?: Error, value?: unknown) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); if (error) reject(error); else resolve(value); };
      const req = httpsRequest({hostname:host, port, servername, ca, rejectUnauthorized:true, method:"POST", path:"/api/vision/v1/command", agent:false, maxHeaderSize:8192,
        headers:{Authorization:`Bearer ${credential.token}`, "Content-Type":"application/json", "Content-Length":bytes.length}}, res => {
        if (res.statusCode !== 200 || res.headers["content-type"]?.split(";")[0] !== "application/json") { finish(fail()); res.destroy(); req.destroy(); return; }
        const chunks: Buffer[] = []; let size=0;
        res.on("data", (chunk:Buffer) => {size+=chunk.length; if(size>32768) {finish(fail()); res.destroy(); req.destroy();} else chunks.push(chunk);});
        res.on("error", () => finish(fail()));
        res.on("end", () => {try {finish(undefined, JSON.parse(Buffer.concat(chunks).toString("utf8")));} catch {finish(fail());}});
      });
      const abort = () => {finish(fail()); req.destroy();};
      const timer = setTimeout(abort, Math.max(1,deadline-Date.now()));
      signal?.addEventListener("abort",abort,{once:true});
      req.on("error", () => finish(fail())); req.end(bytes);
    });
    const current = provider.read();
    if (Date.now() >= deadline || performance.now() >= monotonicDeadline || !current || current.token !== credential.token || current.expiresAt <= Date.now() || signal?.aborted) throw fail();
    if (!object(result) || !keys(result,["protocol","type","request_id","device_id","session_nonce","status","payload"]) || result.protocol!=="vision.v1" || result.type!=="result" || result.request_id!==id || result.device_id!==DEVICE || typeof result.session_nonce!=="string" || !/^[A-Za-z0-9_-]{22,128}$/.test(result.session_nonce) || result.status!=="ok") throw fail();
    const p=result.payload;
    if (!object(p) || !keys(p,["adapter","available","config_revision","detector_revision","detector","zone_count"]) || p.adapter!=="synthetic" || typeof p.available!=="boolean" || !Number.isSafeInteger(p.config_revision) || (p.config_revision as number)<0 || !Number.isSafeInteger(p.detector_revision) || (p.detector_revision as number)<0 || !Number.isInteger(p.zone_count) || (p.zone_count as number)<0 || (p.zone_count as number)>32 || !object(p.detector) || !keys(p.detector,["model","precision"]) || !["yolo11n","yolo11s"].includes(p.detector.model as string) || !["fp16","fp32"].includes(p.detector.precision as string)) throw fail();
    return {revision:p.detector_revision as number, model:p.detector.model as VisionStatus["model"], precision:p.detector.precision as VisionStatus["precision"], source:p.available?"synthetic":"unavailable", online:p.available, reason:p.available?"synthetic_status_pilot":"adapter_unavailable", capabilities:{status:capabilities.status, preview:false, edit:false}};
  }};
}
export function createVisionPilotTransport(provider: PilotCredentialProvider) { return transport(provider,HOST,443,HOST); }
export function createVisionPilotTLSFixture(provider: PilotCredentialProvider, port: number, ca: string) {
  if (Reflect.get(process.env,"NODE_ENV")!=="test" || process.env.VERCEL_ENV==="production" || !Number.isInteger(port) || port<1024 || port>65535 || !ca.includes("-----BEGIN CERTIFICATE-----")) throw fail();
  return transport(provider,"127.0.0.1",port,"localhost",ca);
}
export function configuredVisionPilotTransport() {
  if (typeof window!=="undefined" || process.env.DASHBOARD_VISION_STATUS_PILOT!=="1") return;
  const provider=environmentPilotCredential(process.env);
  if (!provider.read()) return;
  if (process.env.DASHBOARD_VISION_PILOT_TLS_FIXTURE_PORT || process.env.DASHBOARD_VISION_PILOT_TLS_FIXTURE_CA) {
    if (Reflect.get(process.env,"NODE_ENV")!=="test" || process.env.VERCEL_ENV==="production") return;
    try {const port=process.env.DASHBOARD_VISION_PILOT_TLS_FIXTURE_PORT??""; if(!/^\d{4,5}$/.test(port)) return;
      const path=process.env.DASHBOARD_VISION_PILOT_TLS_FIXTURE_CA??""; if(!path.startsWith("/")) return;
      const ca=readFileSync(path,"utf8"); if(ca.length>32768) return;
      return createVisionPilotTLSFixture(provider,+port,ca);
    } catch {return;}
  }
  return createVisionPilotTransport(provider);
}
