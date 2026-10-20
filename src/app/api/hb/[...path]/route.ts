import { NextResponse } from "next/server";
import { hb, type Method } from "@/lib/hb";
import { findRule } from "@/lib/hb-rules";
import { requestError, sessionUser, RequestError } from "@/lib/request-user";
import { zoneEditorConfig } from "@/lib/zone-editor";
import type { SessionUser } from "@/lib/jwt";

/** The page's view of a response: the tablet does not get presence; the page learns whether the zone editor is set up. */
function shape(path: string, data: unknown, user: SessionUser): unknown {
  if (path !== "devices" || !data || typeof data !== "object") return data;
  const page: Record<string, unknown> = { ...(data as Record<string, unknown>), zone_editor: user.role !== "kid" && !!zoneEditorConfig() };
  if (user.role === "kid") delete page.presence;
  return page;
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }, method: Method) {
  try {
    const user = await sessionUser(request);
    const segments = (await context.params).path ?? [];
    if (segments.some((s) => !s || s === "." || s === "..")) throw new RequestError("not found", 404);
    const path = segments.map(encodeURIComponent).join("/");
    const rule = findRule(method, segments.join("/"), user.role === "kid" ? "kid" : "member");
    if (rule === null) throw new RequestError("not found", 404);
    if (rule === "forbidden") throw new RequestError("forbidden", 403);
    let body: unknown = undefined;
    if (method !== "GET" && method !== "DELETE") {
      const text = await request.text();
      if (text) {
        try { body = JSON.parse(text); } catch { throw new RequestError("JSON 格式錯誤", 400); }
      }
    }
    const query = new URL(request.url).search;
    const data = await hb(method, `/v2/${path}${query}`, { body, user, timeoutMs: rule.timeoutMs });
    return NextResponse.json(shape(segments.join("/"), data, user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    return requestError(err);
  }
}

export const GET = (r: Request, c: { params: Promise<{ path: string[] }> }) => handle(r, c, "GET");
export const POST = (r: Request, c: { params: Promise<{ path: string[] }> }) => handle(r, c, "POST");
export const PATCH = (r: Request, c: { params: Promise<{ path: string[] }> }) => handle(r, c, "PATCH");
export const PUT = (r: Request, c: { params: Promise<{ path: string[] }> }) => handle(r, c, "PUT");
export const DELETE = (r: Request, c: { params: Promise<{ path: string[] }> }) => handle(r, c, "DELETE");
