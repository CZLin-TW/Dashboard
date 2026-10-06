"use client";

import { useEffect, useRef, useState } from "react";
import type { VisionCapabilities, VisionConfig, VisionPreview, VisionStatus, VisionTransport } from "@/lib/vision-contract";
import { createVisionTransport, VisionRequestError } from "./transport";
import styles from "./vision.module.css";
import { NativeVisionPreview } from "./native-vision-preview";
import { useUser } from "@/hooks/use-user";

const defaultTransport = createVisionTransport();
const denied: VisionCapabilities = { status: false, preview: false, edit: false };
const same = (a?: VisionConfig, b?: VisionConfig) => !!a && !!b && a.model === b.model && a.precision === b.precision;

export function VisionPanel({ transport = defaultTransport }: { transport?: VisionTransport }) {
  const { currentUser } = useUser();
  const [capabilities, setCapabilities] = useState(denied);
  const [status, setStatus] = useState<VisionStatus>();
  const [saved, setSaved] = useState<VisionConfig>();
  const [draft, setDraft] = useState<VisionConfig>();
  const [previous, setPrevious] = useState<VisionConfig>();
  const [preview, setPreview] = useState<VisionPreview>();
  const [pending, setPending] = useState("讀取中");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const usable = status?.online === true && status.source === "synthetic";
  const dirty = !!draft && !same(saved, draft);

  function begin(kind: string) {
    if (request.current) return null;
    const controller = new AbortController(); request.current = controller;
    setPending(kind); setError(""); setNotice(""); return controller;
  }
  function finish(controller: AbortController) {
    if (mounted.current && request.current === controller) { request.current = null; setPending(""); }
  }
  function failed(reason: unknown, controller: AbortController) {
    if (!mounted.current || controller.signal.aborted || request.current !== controller) return;
    setPreview(undefined); setCapabilities(denied); setStatus(undefined); setSaved(undefined); setDraft(undefined); setPrevious(undefined); setNotice("");
    setError(reason instanceof VisionRequestError ? reason.message : "操作結果未知。請手動重新讀取後確認；不會自動重送。");
  }
  async function load(controller: AbortController) {
    try {
      const access = await transport.access(controller.signal);
      if (controller.signal.aborted || request.current !== controller || !mounted.current) return;
      if (!access.status) { setCapabilities(denied); setStatus(undefined); setSaved(undefined); setDraft(undefined); setError("您沒有視覺狀態的讀取權限。"); return; }
      const next = await transport.status(controller.signal);
      const config = next.online && (access.edit || access.preview) ? await transport.config(controller.signal) : undefined;
      if (controller.signal.aborted || !mounted.current || request.current !== controller) return;
      setCapabilities({ status: access.status && next.capabilities.status, preview: access.preview && next.capabilities.preview, edit: access.edit && next.capabilities.edit });
      setStatus(next); setSaved(config); setDraft(config); setPrevious(undefined); setPreview(undefined);
    } catch (reason) { failed(reason, controller); } finally { finish(controller); }
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController(); request.current = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external transport initialization; state follows its async response or failure
    void load(controller);
    return () => { mounted.current = false; request.current?.abort(); request.current = null; };
    // A transport change is a new session; do not keep requests from the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);

  async function save() {
    if (!draft || !saved || !dirty || !capabilities.edit || !usable) return;
    const controller = begin("儲存中"); if (!controller) return;
    try {
      const result = await transport.save({ ...draft, revision: saved.revision }, controller.signal);
      if (!mounted.current || controller.signal.aborted || request.current !== controller) return;
      setPrevious(saved); setSaved(result); setDraft(result); setNotice("示範設定已儲存；未執行真實模型或修改相機。");
    } catch (reason) { failed(reason, controller); } finally { finish(controller); }
  }
  async function startPreview() {
    if (!usable || !capabilities.preview) return;
    const controller = begin("準備示意圖"); if (!controller) return;
    try {
      const result = await transport.preview(controller.signal);
      if (mounted.current && !controller.signal.aborted && request.current === controller && result.source === "synthetic") setPreview(result);
    } catch (reason) { failed(reason, controller); } finally { finish(controller); }
  }
  function stopPreview() {
    if (pending === "準備示意圖") { request.current?.abort(); request.current = null; setPending(""); }
    setPreview(undefined);
  }
  const reason = status?.reason === "empty" ? "尚未建立視覺來源。" : "來源不可用；區域存在狀態未知。";
  return <main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>FLOOR PRESENCE · 第 1 階段</p><h1>視覺區域</h1><p>先確認來源，再調整設定</p></div>
      <button disabled={!!pending} onClick={() => { const controller = begin("讀取中"); if (controller) void load(controller); }}>重新讀取</button>
    </header>
    <div role="status" className={usable && capabilities.status ? styles.banner : styles.offline}>
      {usable && capabilities.status ? "合成示範 · 沒有真相機影像，未執行 YOLO 推論" : "視覺來源未就緒 · 無有效偵測結果"}
      <p>{usable && capabilities.status ? "示意圖與設定只存在測試情境。狀態為單次讀取，非持續監控。" : reason}</p>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.layout}>
      <section className={styles.previewCard} aria-label="視覺預覽">
        <div className={styles.sectionHead}><h2>來源預覽</h2><span>{preview ? "合成示意圖" : "預覽已停止"}</span></div>
        <div className={styles.canvas}>
          {preview && usable && capabilities.preview ? <svg viewBox="0 0 640 400" role="img" aria-label="合成人物與地板示意，非真實影像">
            <defs><pattern id="vision-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#345568" strokeWidth="1" /></pattern></defs>
            <rect width="640" height="400" fill="#101f2c" /><path d="M0 160H640V400H0Z" fill="url(#vision-grid)" />
            <path d="M110 270L355 240L500 360L150 375Z" fill="#49bfae" fillOpacity=".15" stroke="#49bfae" strokeDasharray="7 7" />
            <rect x="270" y="110" width="70" height="190" rx="8" fill="none" stroke="#f2c56d" strokeWidth="2" /><circle cx="305" cy="140" r="16" fill="#afc6d5" /><path d="M305 164V235M280 203L305 178L330 203M305 235L284 284M305 235L326 284" fill="none" stroke="#afc6d5" strokeWidth="12" strokeLinecap="round" />
            <circle cx="305" cy="300" r="6" fill="#f2c56d" /><text x="20" y="32" fill="#f2c56d" fontSize="17">SYNTHETIC · 非相機影像</text><text x="350" y="124" fill="#afc6d5" fontSize="15">DEMO #1</text><text x="20" y="383" fill="#afc6d5" fontSize="14">示意地板區域 · 不能據此判斷有人／無人</text>
          </svg> : <div className={styles.placeholder}><strong>{usable ? "按下開啟，查看合成示意圖" : "目前沒有可顯示的影像"}</strong><p>不會自動開啟相機或串流</p></div>}
        </div>
        <div className={styles.actions}><button onClick={() => void startPreview()} disabled={!usable || !capabilities.preview || !!pending || !!preview}>開啟合成預覽</button><button onClick={stopPreview} disabled={!preview && pending !== "準備示意圖"}>停止預覽</button></div>
        <p className={styles.hint}>地面點與區域僅為示意。畫區功能待串流與同影格校正完成後開放。</p>
        <NativeVisionPreview key={currentUser?.lineUserId ?? "signed-out"} />
      </section>
      <section className={styles.controls} aria-label="視覺設定">
        <h2>模型設定草稿</h2><p className={styles.hint}>此階段只驗證設定流程，沒有載入模型。</p>
        <fieldset disabled={!usable || !capabilities.edit || !!pending || !draft}>
          <label>人物模型<select aria-label="人物模型" value={draft?.model || "yolo11n"} onChange={e => { if (draft) setDraft({ ...draft, model: e.target.value as VisionConfig["model"] }); setNotice(""); }}><option value="yolo11n">YOLO11n · 輕量</option><option value="yolo11s">YOLO11s · 較精細</option></select></label>
          <label>推論精度<select aria-label="推論精度" value={draft?.precision || "fp16"} onChange={e => { if (draft) setDraft({ ...draft, precision: e.target.value as VisionConfig["precision"] }); setNotice(""); }}><option value="fp16">FP16</option><option value="fp32">FP32</option></select></label>
          <p className={styles.hint}>{saved ? `已儲存：${saved.model} / ${saved.precision.toUpperCase()} · 版本 ${saved.revision}` : "尚無可編輯設定"}</p>
          <div className={styles.actions}><button className={styles.primary} disabled={!dirty} onClick={() => void save()}>儲存設定</button><button disabled={!dirty} onClick={() => { setDraft(saved); setNotice("已取消草稿，已儲存設定未變更。"); }}>取消草稿</button></div>
          <button disabled={!previous} onClick={() => { if (previous && saved) { setDraft({ ...previous, revision: saved.revision }); setNotice("上次設定已還原到草稿，按儲存才會套用。"); } }}>還原上次設定到草稿</button>
        </fieldset>
        <p aria-live="polite" className={styles.hint}>{pending || (dirty ? "有未儲存草稿；離開此頁會捨棄。" : "沒有待儲存變更")}</p>
        <hr /><h2>地板區域</h2><button disabled aria-describedby="vision-roi-reason">編輯地板 ROI（尚未開放）</button><p id="vision-roi-reason" className={styles.hint}>第 3 階段才提供同影格校正與多邊形編輯；目前不會儲存區域或發送 HA occupancy。</p>
        <p className={styles.localNote}>相機帳密只在 Mac 的原生本機視窗管理。Dashboard 不提供帳密輸入、讀回或匯出。</p>
      </section>
    </div>
  </main>;
}
