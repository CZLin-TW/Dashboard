/** Server route helpers only. Never import this module into a client component.
 * No transport or camera/broker client exists in Phase 1.
 */
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { requestUser, RequestError } from "./request-user";
import type { VisionCapabilities, VisionConfig } from "./vision-contract";

type Capability = keyof VisionCapabilities;
const CAPABILITIES: Capability[] = ["status", "preview", "edit"];
class VisionError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function visionJSON(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}
function readPolicy(): Map<string, Capability[]> {
  const raw = process.env.DASHBOARD_VISION_GRANTS;
  if (!raw || raw.length > 65536) return new Map();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const policy = new Map<string, Capability[]>();
    for (const [id, grants] of Object.entries(parsed)) {
      if (!id.trim() || id.length > 256 || !Array.isArray(grants) || grants.some(g => !CAPABILITIES.includes(g)) || new Set(grants).size !== grants.length) return new Map();
      policy.set(id, grants);
    }
    return policy;
  } catch { return new Map(); }
}
export async function requireVision(request: Request, capability?: Capability): Promise<VisionCapabilities> {
  const userId = await requestUser(request); // Verified session cookie; never a client identity header.
  if (typeof userId !== "string" || !userId.trim()) throw new RequestError("請先登入。", 401);
  // Existing verifier checks signatures/expiry. Require an expiry claim as well;
  // a signed token with no expiry must not become a permanent vision grant.
  const token = new NextRequest(request.url, { headers: request.headers }).cookies.get("dashboard_session")?.value;
  if (!token || typeof decodeJwt(token).exp !== "number") throw new RequestError("請先登入。", 401);
  const grants = readPolicy().get(userId) ?? [];
  const capabilities: VisionCapabilities = { status: grants.includes("status"), preview: grants.includes("preview"), edit: grants.includes("edit") };
  if (!grants.length || (capability && !capabilities[capability])) throw new VisionError(403, "vision_forbidden", "此帳號沒有這項視覺權限。");
  return capabilities;
}
export function requireVisionMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) throw new VisionError(403, "origin_forbidden", "請從同一個 Dashboard 操作。");
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new VisionError(415, "json_required", "請使用 JSON 格式。");
}
export async function readVisionBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new VisionError(400, "invalid_json", "請提供有效 JSON。");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 4096) {
      await reader.cancel();
      throw new VisionError(413, "body_too_large", "設定內容過大。");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new VisionError(400, "invalid_json", "請提供有效 JSON。"); }
}
export function validateVisionConfig(value: unknown): asserts value is VisionConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new VisionError(400, "invalid_config", "視覺設定格式無效。");
  const c = value as Record<string, unknown>;
  if (Object.keys(c).length !== 3 || !Number.isSafeInteger(c.revision) || (c.revision as number) < 0 || !["yolo11n", "yolo11s"].includes(c.model as string) || !["fp16", "fp32"].includes(c.precision as string)) throw new VisionError(400, "invalid_config", "視覺設定格式無效。");
}
export function visionUnavailable() {
  return visionJSON({ code: "vision_unavailable", message: "尚未接通本機視覺服務" }, 503);
}
export function visionError(error: unknown) {
  if (error instanceof VisionError) return visionJSON({ code: error.code, message: error.message }, error.status);
  if (error instanceof RequestError) return visionJSON({ code: error.status === 401 ? "unauthorized" : "vision_forbidden", message: error.status === 401 ? "請先登入。" : "此帳號沒有視覺權限。" }, error.status);
  return visionJSON({ code: "vision_error", message: "暫時無法處理視覺請求。" }, 500);
}
