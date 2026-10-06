"use client";

import { useEffect, useRef, useState } from "react";
import { createNativeMediaTransport, nativePreviewAllowed, NativeMediaError, type NativeMediaTransport } from "./native-media-transport";
import { NativeFrameClock, decodeNativeFrameId } from "./native-frame";
import styles from "./native-preview.module.css";

const defaultTransport = createNativeMediaTransport();
type Phase = "idle" | "connecting" | "playing" | "stopping";
type FrameView = ReturnType<NativeFrameClock["snapshot"]>;
const noFrame: FrameView = { id: null, advances: 0, ageMs: null, fresh: false };
interface Running {
  generation: number; peer: RTCPeerConnection; abort: AbortController; lease: string | null;
  heartbeat?: ReturnType<typeof setInterval>; display?: ReturnType<typeof setInterval>;
  expiry?: ReturnType<typeof setTimeout>; callback?: number;
}
async function gather(peer: RTCPeerConnection, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => done(new NativeMediaError(408)), 5000);
    function done(error?: unknown) { clearTimeout(timer); peer.removeEventListener("icegatheringstatechange", change); signal.removeEventListener("abort", aborted); if (error) reject(error); else resolve(); }
    function change() { if (peer.iceGatheringState === "complete") done(); }
    function aborted() { done(new DOMException("Cancelled", "AbortError")); }
    peer.addEventListener("icegatheringstatechange", change); signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted(); else change();
  });
}

/** Uses an independently authenticated preview grant; never depends on model/status access. */
export function NativeVisionPreview({ transport = defaultTransport }: { transport?: NativeMediaTransport }) {
  const video = useRef<HTMLVideoElement>(null);
  const running = useRef<Running | null>(null);
  const mounted = useRef(false), generation = useRef(0), stopping = useRef(false);
  const accessRequest = useRef<AbortController | null>(null);
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [frame, setFrame] = useState<FrameView>(noFrame);
  const [message, setMessage] = useState("尚未開始原生預覽");
  const [error, setError] = useState("");

  function release(reason: string) {
    generation.current++;
    const current = running.current; running.current = null;
    if (current) {
      current.abort.abort(); clearInterval(current.heartbeat); clearInterval(current.display); clearTimeout(current.expiry);
      if (current.callback !== undefined) video.current?.cancelVideoFrameCallback?.(current.callback);
      current.peer.ontrack = current.peer.onconnectionstatechange = null;
      for (const receiver of current.peer.getReceivers()) receiver.track?.stop();
      for (const sender of current.peer.getSenders()) sender.track?.stop();
      current.peer.close();
    }
    const element = video.current;
    if (element) { const stream = element.srcObject as MediaStream | null; for (const track of stream?.getTracks() || []) track.stop(); element.pause(); element.srcObject = null; }
    if (mounted.current) { setPhase("idle"); setFrame(noFrame); setMessage(reason); }
    return current?.lease;
  }
  function stop(reason = "已停止並釋放本機預覽") {
    const lease = release(reason);
    if (!lease) return;
    stopping.current = true;
    const stoppedGeneration = generation.current;
    if (mounted.current) setPhase("stopping");
    // Bounded keepalive stop survives component unmount; no automatic retry.
    void transport.stop(lease).catch(() => {
      if (mounted.current && generation.current === stoppedGeneration) setError("本機已釋放；伺服器停止結果未知，TTL 仍會回收。請手動確認，不會重送。");
    }).finally(() => {
      stopping.current = false;
      if (mounted.current && generation.current === stoppedGeneration) setPhase("idle");
    });
  }
  async function checkAccess() {
    if (accessRequest.current) return;
    const controller = new AbortController(); accessRequest.current = controller;
    try {
      const access = await transport.access(controller.signal);
      if (!mounted.current || controller.signal.aborted || accessRequest.current !== controller) return;
      const allowed = nativePreviewAllowed(access);
      setAvailable(allowed);
      if (!allowed) { stop("原生預覽未啟用或未獲授權"); }
    } catch (reason) {
      if (!mounted.current || controller.signal.aborted) return;
      setAvailable(false); stop("原生預覽不可用");
      setError(reason instanceof NativeMediaError ? reason.message : "無法確認原生預覽權限；請手動重新檢查。");
    } finally { if (accessRequest.current === controller) accessRequest.current = null; if (mounted.current) setChecking(false); }
  }
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state follows the authenticated external access response
    void checkAccess();
    const hidden = () => { if (document.visibilityState === "hidden") stop("頁面隱藏，已釋放預覽"); };
    const leaving = () => stop("離開頁面，已釋放預覽");
    const expired = () => { accessRequest.current?.abort(); accessRequest.current = null; setAvailable(false); setChecking(false); stop("登入狀態已變更，已釋放預覽"); };
    const storage = (event: StorageEvent) => { if (event.key === "session:logout") expired(); };
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", leaving);
    window.addEventListener("session:expired", expired); window.addEventListener("storage", storage);
    return () => {
      mounted.current = false; accessRequest.current?.abort(); accessRequest.current = null;
      stop("元件卸載"); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", leaving);
      window.removeEventListener("session:expired", expired); window.removeEventListener("storage", storage);
    };
    // Lifecycle belongs to this injected transport; local state must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);

  async function start() {
    if (!available || checking || running.current || stopping.current || document.visibilityState === "hidden") return;
    const element = video.current;
    if (!element?.requestVideoFrameCallback || typeof RTCPeerConnection === "undefined") { setError("此瀏覽器不支援所需的 WebRTC／影格回呼。"); return; }
    setError(""); setPhase("connecting"); setFrame(noFrame); setMessage("正在建立原生合成預覽…");
    const peer = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
    const current: Running = { generation: ++generation.current, peer, abort: new AbortController(), lease: null };
    running.current = current;
    const valid = () => mounted.current && running.current === current && !current.abort.signal.aborted;
    const clock = new NativeFrameClock();
    const canvas = document.createElement("canvas"); canvas.width = 192; canvas.height = 24;
    const pixels = canvas.getContext("2d", { willReadFrequently: true });
    const fail = (reason: unknown) => {
      if (!valid()) return;
      if (reason instanceof NativeMediaError && (reason.status === 401 || reason.status === 403)) setAvailable(false);
      setError(reason instanceof NativeMediaError ? reason.message : "原生預覽中斷或無法驗證影格；不會自動重試。"); stop("預覽已釋放");
    };
    const watch = () => {
      current.callback = element.requestVideoFrameCallback(() => {
        if (!valid()) return;
        try {
          // Fixed source geometry and native marker, not an asynchronous bbox overlay.
          if (element.videoWidth === 640 && element.videoHeight === 360 && pixels) {
            pixels.drawImage(element, 0, 108, 192, 24, 0, 0, 192, 24);
            clock.ingest(decodeNativeFrameId(pixels.getImageData(0, 0, 192, 24).data), performance.now());
          }
          setFrame(clock.snapshot(performance.now())); watch();
        } catch (reason) { fail(reason); }
      });
    };
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.ontrack = event => {
      if (!valid()) { event.track.stop(); return; }
      element.srcObject = event.streams[0] || new MediaStream([event.track]);
      watch(); void element.play().catch(fail);
    };
    peer.onconnectionstatechange = () => { if (["failed", "disconnected"].includes(peer.connectionState)) fail(new NativeMediaError(503)); };
    try {
      await peer.setLocalDescription(await peer.createOffer()); await gather(peer, current.abort.signal);
      if (!valid()) return;
      const answer = await transport.offer({ type: "offer", sdp: peer.localDescription!.sdp }, current.abort.signal);
      if (!valid()) { void transport.stop(answer.session_id).catch(() => {}); return; }
      current.lease = answer.session_id;
      const remaining = answer.expires_at * 1000 - Date.now();
      if (remaining <= 0 || remaining > 60000) throw new NativeMediaError(502);
      await peer.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
      if (!valid()) return;
      setPhase("playing"); setMessage("原生合成串流已建立；影格新鮮度見上方。");
      current.expiry = setTimeout(() => { if (valid()) stop("TTL 到期，已釋放預覽"); }, Math.max(0, answer.expires_at * 1000 - Date.now()));
      current.display = setInterval(() => { if (valid()) setFrame(clock.snapshot(performance.now())); }, 200);
      let busy = false;
      current.heartbeat = setInterval(async () => {
        if (busy || !valid() || !current.lease) return; busy = true;
        try { await transport.heartbeat(current.lease, current.abort.signal); } catch (reason) { fail(reason); } finally { busy = false; }
      }, 3000);
    } catch (reason) { fail(reason); }
  }
  return <section className={styles.region} aria-label="原生合成預覽" data-testid="native-vision-preview"
    data-native-frame-id={frame.id ?? ""} data-native-advances={frame.advances} data-native-fresh={frame.fresh} data-native-active={phase === "connecting" || phase === "playing"}>
    <h3>原生 WebRTC 預覽</h3>
    <p className={styles.banner}>僅合成測試 · 原生 Python 影格經 WebRTC 傳送；沒有真相機或 YOLO 推論。</p>
    <video ref={video} className={styles.video} muted autoPlay playsInline aria-label="原生合成串流影像" hidden={!available} />
    {!available && <p className={styles.unavailable}>{checking ? "檢查原生預覽權限…" : "原生預覽未啟用或未獲授權。正式環境目前不提供串流。"}</p>}
    <div className={styles.stats}><strong className={frame.fresh ? styles.fresh : styles.stale}>{frame.id === null ? "尚無可驗證影格" : frame.fresh ? "原生影格持續更新" : "影格過期／停止更新"}</strong><span>Frame ID {frame.id ?? "—"}</span><span>{frame.ageMs === null ? "影格年齡 —" : `距新影格 ${(frame.ageMs / 1000).toFixed(1)} 秒`}</span></div>
    <div className={styles.actions}>
      <button disabled={!available || checking || phase !== "idle"} onClick={() => void start()}>開始原生合成串流</button>
      <button disabled={phase !== "connecting" && phase !== "playing"} onClick={() => stop(phase === "connecting" ? "已取消連線" : undefined)}>{phase === "connecting" ? "取消連線" : "停止原生預覽"}</button>
      <button disabled={checking || phase !== "idle"} onClick={() => { setChecking(true); setError(""); void checkAccess(); }}>重新檢查原生預覽</button>
    </div>
    <p role="status">{message}</p>{error && <p role="alert" className={styles.error}>{error}</p>}
    <p>Frame ID、時間戳與框燒入同一張原生影格；沒有不同步疊框。背景、離頁與 TTL 到期會釋放預覽，不會自動重連。</p>
  </section>;
}
