"use client";
import { useEffect, useRef, useState } from "react";
import type { VisionHealthStatus } from "@/lib/vision-contract";
import { parseVisionHealthStatus } from "@/lib/vision-health";
import styles from "./vision-health.module.css";

class HealthReadError extends Error {}

export function VisionHealthPanel() {
  const [health, setHealth] = useState<VisionHealthStatus>();
  const [receivedAt, setReceivedAt] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);
  async function read() {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    setPending(true); setError(""); setHealth(undefined); setReceivedAt(undefined);
    try {
      const response = await fetch("/api/vision/v1/status", { signal: controller.signal, credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!response.ok) throw new HealthReadError(response.status === 401 || response.status === 403 ? "目前帳號沒有擁有者存取權，請重新確認登入。" : "未取得有效的 mini 回覆；目前連線與本機服務狀態未知。");
      let body: unknown;
      try { body = await response.json(); } catch { throw new HealthReadError("健康回報格式不符；目前本機服務狀態未知。"); }
      const value = parseVisionHealthStatus(body);
      if (!value) throw new HealthReadError("健康回報格式不符；目前本機服務狀態未知。");
      if (controller.signal.aborted || current.current !== controller) return;
      setHealth(value); setReceivedAt(new Date().toLocaleString("zh-TW", { hour12: false }));
    } catch (reason) {
      if (controller.signal.aborted || current.current !== controller) return;
      setError(reason instanceof HealthReadError ? reason.message : "讀取未完成；目前狀態未知。");
    } finally { if (current.current === controller) { current.current = null; setPending(false); } }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize a bounded read of the authorized server status
    void read();
    return () => { current.current?.abort(); current.current = null; };
  }, []);
  return <section className={styles.page} data-testid="vision-health-panel">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>FLOOR PRESENCE · 唯讀試行</p><h1>本機服務狀態</h1><p>僅擁有者可讀 · 手動更新，不持續監控</p></div>
      <button onClick={() => void read()} disabled={pending}>{pending ? "讀取中" : "重新讀取狀態"}</button>
    </header>
    <div className={styles.notice}>只檢查 Floor Presence 的 HTTP 健康端點。未檢查相機影像或人物偵測，也不代表目前有人或無人。</div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.grid} aria-live="polite">
      <section className={styles.card} aria-label="mini 到 HB 通道">
        <p className={styles.step}>01 · 服務通道</p><h2>mini → HB 通道</h2>
        <p className={health ? styles.good : styles.unknown}>{pending ? "正在讀取" : health ? "已收到 mini 回覆" : "連線狀態未知"}</p>
        <p>表示這次已取得 mini 的狀態回報，與本機 HTTP 服務是否回應分開判定。</p>
      </section>
      <section className={styles.card} aria-label="本機服務 HTTP 健康">
        <p className={styles.step}>02 · 本機服務</p><h2>本機服務 HTTP 健康</h2>
        <p className={health?.service.reachable ? styles.good : styles.unknown}>{pending ? "等待回報" : health ? health.service.reachable ? "HTTP 服務已回應" : "HTTP 服務未回應" : "尚未確認"}</p>
        <p>{health && !health.service.reachable ? "mini 通道有回覆，但本機健康端點未提供有效回應。" : "HTTP 健康回應不代表相機或偵測模型正常。"}</p>
      </section>
    </div>
    <section className={styles.details} aria-label="服務回報資訊">
      <h2>本次回報</h2>
      <dl>
        <div><dt>服務版本</dt><dd data-testid="health-app-version">{health?.service.app_version ?? "未回報"}</dd></div>
        <div><dt>執行模式</dt><dd>{health?.service.mode === "localhost-dev" ? "本機開發" : health?.service.mode === "production" ? "正式模式" : "未回報"}</dd></div>
        <div><dt>設定格式版本</dt><dd>{health?.service.config_schema ?? "未回報"}</dd></div>
        <div><dt>本次收到時間</dt><dd>{receivedAt ?? "尚無有效回報"}</dd></div>
      </dl>
      <p className={styles.footnote}>時間為 Dashboard 收到回覆的時間；健康端點未提供來源時間，不代表影像或偵測結果的新鮮度。</p>
    </section>
  </section>;
}
