/** Browser-side BFF only. No native device address, Bearer token or upstream ID. */
export interface NativeMediaAccess { capabilities: { preview: boolean }; native_preview_available?: boolean }
export interface NativeMediaAnswer { session_id: string; type: "answer"; sdp: string; expires_at: number }
export interface NativeMediaTransport {
  access(signal?: AbortSignal): Promise<NativeMediaAccess>;
  offer(offer: { type: "offer"; sdp: string }, signal?: AbortSignal): Promise<NativeMediaAnswer>;
  heartbeat(lease: string, signal?: AbortSignal): Promise<void>;
  stop(lease: string): Promise<void>;
}
export function nativePreviewAllowed(access: NativeMediaAccess | null | undefined) {
  return access?.capabilities?.preview === true && access.native_preview_available === true;
}
export class NativeMediaError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 || status === 403 ? "沒有原生預覽權限，請重新確認登入。" : status === 409 ? "預覽已被占用；請先停止既有連線。" : status === 408 ? "預覽請求逾時，結果未知；不會自動重試。" : "原生預覽尚未可用或操作失敗；不會自動重試。");
  }
}
export function createNativeMediaTransport(timeoutMs = 6000): NativeMediaTransport {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) throw new RangeError("Invalid media timeout");
  async function request<T>(path: string, body?: object, parent?: AbortSignal, keepalive = false): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (parent?.aborted) throw new DOMException("Cancelled", "AbortError");
    parent?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const result = await fetch(`/api/vision/v1/${path}`, { method: body ? "POST" : "GET", signal: controller.signal,
        credentials: "same-origin", cache: "no-store", redirect: "error", keepalive,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!result.ok) throw new NativeMediaError(result.status);
      return await result.json() as T;
    } catch (error) { if (timedOut) throw new NativeMediaError(408); throw error; }
    finally { clearTimeout(timer); parent?.removeEventListener("abort", cancel); }
  }
  return {
    access: signal => request("access", undefined, signal),
    offer: async (offer, signal) => {
      const answer = await request<NativeMediaAnswer>("media/offer", offer, signal);
      if (!answer || typeof answer.session_id !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(answer.session_id) || answer.type !== "answer" || typeof answer.sdp !== "string" || answer.sdp.length > 32768 || !Number.isFinite(answer.expires_at)) throw new NativeMediaError(502);
      return answer;
    },
    heartbeat: async (lease, signal) => { const result = await request<{ active: boolean }>("media/heartbeat", { session_id: lease, visible: true }, signal); if (result?.active !== true) throw new NativeMediaError(503); },
    stop: async lease => { const result = await request<{ active: boolean }>("media/stop", { session_id: lease }, undefined, true); if (result?.active !== false) throw new NativeMediaError(503); },
  };
}
