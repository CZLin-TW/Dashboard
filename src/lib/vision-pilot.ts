/** Status-only HB pilot. Uses the existing household server API key and JWT actor.
 * HB membership/grants are authoritative; no second vision service credential.
 */
import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { VisionHTTPError } from "./vision-http";
import type { VisionCapabilities, VisionStatus } from "./vision-contract";
export interface VisionActor { id: string; role: "member"; expiresAt: number }
export interface PilotCredentialProvider { read(): string | undefined }
const DEVICE = "floor-mini-01";
const HOST = "home-butler.onrender.com";
const fail = (status = 503, code = "vision_pilot_unavailable") => new VisionHTTPError(status, code);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join() === expected.sort().join();
export function environmentPilotCredential(env: Record<string, string | undefined>): PilotCredentialProvider {
  return { read() { const key = env.HOME_BUTLER_API_KEY; return key && /^[\x21-\x7e]{1,512}$/.test(key) ? key : undefined; } };
}
function validActor(actor: VisionActor) {
  if (!actor || actor.role !== "member" || !/^[A-Za-z0-9_-]{1,128}$/.test(actor.id) || !Number.isSafeInteger(actor.expiresAt / 1000) || actor.expiresAt <= Date.now()) throw fail(401, "unauthorized");
}
function transport(provider: PilotCredentialProvider, host: string, port: number, servername: string, ca?: string) {
  async function request(actor: VisionActor, path: "access" | "command", payload: object | undefined, signal?: AbortSignal, wireDeadline?: number): Promise<unknown> {
    validActor(actor);
    const key = provider.read();
    if (!key || signal?.aborted) throw fail();
    const deadline = Math.min(Date.now()+7000, actor.expiresAt, wireDeadline ?? Infinity);
    const monotonicDeadline = performance.now() + Math.max(0, deadline-Date.now());
    const bytes = payload ? Buffer.from(JSON.stringify(payload)) : undefined;
    const result: unknown = await new Promise((resolve, reject) => {
      let done = false;
      const finish = (error?: Error, value?: unknown) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); if (error) reject(error); else resolve(value); };
      const req = httpsRequest({hostname:host, port, servername, ca, rejectUnauthorized:true, method:bytes ? "POST" : "GET", path:`/api/vision/v1/${path}`, agent:false, maxHeaderSize:8192,
        headers:{"X-API-Key":key, "X-Dashboard-User":actor.id, "X-Dashboard-Role":"member", "X-Dashboard-Session-Expires":String(actor.expiresAt/1000), ...(bytes ? {"Content-Type":"application/json", "Content-Length":bytes.length} : {})}}, res => {
        if (res.statusCode !== 200 || res.headers["content-type"]?.split(";")[0] !== "application/json") { finish(res.statusCode === 403 ? fail(403, "vision_forbidden") : fail()); res.destroy(); req.destroy(); return; }
        const chunks: Buffer[] = []; let size=0;
        res.on("data", (chunk:Buffer) => {size+=chunk.length; if(size>32768) {finish(fail()); res.destroy(); req.destroy();} else chunks.push(chunk);});
        res.on("error", () => finish(fail()));
        res.on("end", () => {try {finish(undefined, JSON.parse(Buffer.concat(chunks).toString("utf8")));} catch {finish(fail());}});
      });
      const abort = () => {finish(fail()); req.destroy();};
      const timer = setTimeout(abort, Math.max(1,deadline-Date.now()));
      signal?.addEventListener("abort",abort,{once:true});
      req.on("error", () => finish(fail()));
      if (signal?.aborted) abort(); else req.end(bytes);
    });
    validActor(actor);
    if (Date.now() >= deadline || performance.now() >= monotonicDeadline || provider.read() !== key || signal?.aborted) throw fail();
    return result;
  }
  return {
    async access(actor: VisionActor, signal?: AbortSignal): Promise<VisionCapabilities> {
      const value = await request(actor,"access",undefined,signal);
      if (!object(value) || !keys(value,["capabilities"]) || !object(value.capabilities) || !keys(value.capabilities,["status","preview","edit"]) || Object.values(value.capabilities).some(v=>typeof v!=="boolean")) throw fail();
      // This activation is status only even when HB grants future preview/edit rights.
      return {status:value.capabilities.status as boolean,preview:false,edit:false};
    },
    async status(actor: VisionActor, capabilities: VisionCapabilities, signal?: AbortSignal): Promise<VisionStatus> {
      validActor(actor);
      const id = randomUUID();
      const deadline = Math.min(Date.now()+7000,actor.expiresAt);
      const result = await request(actor,"command",{protocol:"vision.v1",type:"command",request_id:id,device_id:DEVICE,action:"status.get",deadline:deadline/1000,payload:{}},signal,deadline);
    if (!object(result) || !keys(result,["protocol","type","request_id","device_id","session_nonce","status","payload"]) || result.protocol!=="vision.v1" || result.type!=="result" || result.request_id!==id || result.device_id!==DEVICE || typeof result.session_nonce!=="string" || !/^[A-Za-z0-9_-]{22,128}$/.test(result.session_nonce) || result.status!=="ok") throw fail();
    const p=result.payload;
    if (!object(p) || !keys(p,["adapter","available","config_revision","detector_revision","detector","zone_count"]) || p.adapter!=="synthetic" || typeof p.available!=="boolean" || !Number.isSafeInteger(p.config_revision) || (p.config_revision as number)<0 || !Number.isSafeInteger(p.detector_revision) || (p.detector_revision as number)<0 || !Number.isInteger(p.zone_count) || (p.zone_count as number)<0 || (p.zone_count as number)>32 || !object(p.detector) || !keys(p.detector,["model","precision"]) || !["yolo11n","yolo11s"].includes(p.detector.model as string) || !["fp16","fp32"].includes(p.detector.precision as string)) throw fail();
    return {revision:p.detector_revision as number, model:p.detector.model as VisionStatus["model"], precision:p.detector.precision as VisionStatus["precision"], source:p.available?"synthetic":"unavailable", online:p.available, reason:p.available?"synthetic_status_pilot":"adapter_unavailable", capabilities:{status:capabilities.status, preview:false, edit:false}};
    }
  };
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
