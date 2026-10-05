import type { VisionCapabilities, VisionConfig, VisionPreview, VisionStatus, VisionTransport } from "@/lib/vision-contract";

export class VisionRequestError extends Error {
  constructor(public readonly status: number) { super(status === 408 ? "請求逾時，操作結果未知。請手動重新讀取後確認；不會自動重送。" : status === 401 || status === 403 ? "您沒有視覺功能的使用權限。" : status === 409 ? "設定版本已變更，請重新讀取後再編輯。" : "視覺服務尚未連線或操作未完成。請手動重新讀取；不會自動重送。"); }
}

/** Same-origin only. Calls fetch at action time so demo interception applies. */
export function createVisionTransport({ timeoutMs = 10_000 }: { timeoutMs?: number } = {}): VisionTransport {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) throw new RangeError("Invalid vision request timeout");
  async function request<T>(path: string, signal?: AbortSignal, body?: unknown, method = "GET"): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const abortReason = () => controller.signal.reason ?? new DOMException("Request cancelled", "AbortError");
    const parentAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) {
      parentAbort();
      throw abortReason();
    }
    signal?.addEventListener("abort", parentAbort, { once: true });
    let rejectOnAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectOnAbort = () => reject(abortReason());
      controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
    });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = (async () => {
        const value = await fetch(`/api/vision/v1/${path}`, {
          method, signal: controller.signal, cache: "no-store", credentials: "same-origin",
          ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
        });
        if (!value.ok) throw new VisionRequestError(value.status);
        // Await body parsing inside the timeout; a stalled body is still pending work.
        return await value.json() as T;
      })();
      // Also bound injected transports which do not honor fetch cancellation.
      return await Promise.race([response, aborted]);
    } catch (error) {
      if (timedOut) throw new VisionRequestError(408);
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", parentAbort);
      if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
    }
  }
  return {
    access: async signal => (await request<{ capabilities: VisionCapabilities }>("access", signal)).capabilities,
    status: signal => request<VisionStatus>("status", signal),
    config: signal => request<VisionConfig>("config", signal),
    save: (config, signal) => request<VisionConfig>("config", signal, config, "PUT"),
    preview: signal => request<VisionPreview>("preview", signal, {}, "POST"),
  };
}
