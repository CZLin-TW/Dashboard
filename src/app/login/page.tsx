"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Zap, RefreshCw, Copy, Check, Lock } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  not_member: "你不是家庭成員，無法登入",
  unauthorized: "登入已過期，請重新登入",
};

type Phase = "checking" | "code" | "expired" | "error";
// 登入方式：pair = 裝置配對（在 LINE 輸入碼，家庭成員 / 兒童）；remote = 遙控器模式（輸入共用密碼）。
// 遙控器模式把「模式選擇」放在 UI 上而非網址，所以加到主畫面後的獨立 PWA 容器也能用
// （網址參數 ?kid=1 在 PWA 啟動時會遺失，這條才是可靠的）。
type Mode = "pair" | "remote";

async function writeTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("copy failed");
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  // 兒童遙控器入口：?kid=1 → 螢幕顯示「配對兒童 XXX」、要碼時標記 kid、核准後落在裝置頁。
  // 角色綁在這個入口上，家長照螢幕指令打即可（且後端「最嚴格者勝」，誤打「登入」也鎖不開）。
  const isKid = searchParams.get("kid") === "1";

  const [mode, setMode] = useState<Mode>("pair");
  const [phase, setPhase] = useState<Phase>("checking");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  // 遙控器模式狀態
  const [pw, setPw] = useState("");
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteErr, setRemoteErr] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef<string>("");

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const requestCode = useCallback(async () => {
    stopPoll();
    setPhase("checking");
    try {
      const res = await fetch("/api/auth/device-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kid: isKid }),
      });
      if (!res.ok) throw new Error("device-code failed");
      const data = await res.json();
      if (!data.user_code || !data.device_token) throw new Error("bad payload");
      setCode(String(data.user_code));
      setCopied(false);
      setCopyFailed(false);
      tokenRef.current = String(data.device_token);
      setPhase("code");

      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(
            `/api/auth/device-poll?token=${encodeURIComponent(tokenRef.current)}`,
          );
          const d = await r.json();
          if (d.status === "approved") {
            stopPoll();
            router.replace(isKid ? "/devices" : "/");
          } else if (d.status === "expired" || d.status === "not_found" || d.status === "consumed") {
            stopPoll();
            setPhase("expired");
          }
        } catch {
          /* 暫時性網路錯誤，下個 tick 再試 */
        }
      }, 3000);
    } catch {
      setPhase("error");
    }
  }, [router, stopPoll, isKid]);

  useEffect(() => {
    let cancelled = false;
    // 已登入就直接進；否則取一組驗證碼開始輪詢。
    fetch("/api/auth/me")
      .then((res) => {
        if (cancelled) return;
        if (res.ok) router.replace("/");
        else requestCode();
      })
      .catch(() => {
        if (!cancelled) requestCode();
      });
    return () => {
      cancelled = true;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      stopPoll();
    };
  }, [router, requestCode, stopPoll]);

  const codeDisplay = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  const loginCommand = code ? `${isKid ? "配對兒童" : "登入"} ${codeDisplay}` : "";

  const copyLoginCommand = useCallback(async () => {
    if (!loginCommand) return;
    try {
      await writeTextToClipboard(loginCommand);
      setCopied(true);
      setCopyFailed(false);
    } catch (err) {
      console.error("[login] copy failed:", err);
      setCopied(false);
      setCopyFailed(true);
    }
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 1800);
  }, [loginCommand]);

  // 遙控器模式：用共用密碼換取受限的 kid session，成功後直接落在裝置頁。
  const submitRemote = useCallback(async () => {
    if (!pw || remoteBusy) return;
    setRemoteBusy(true);
    setRemoteErr(null);
    try {
      const res = await fetch("/api/auth/remote-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        router.replace("/devices");
        return;
      }
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        const mins = Math.max(1, Math.ceil((d?.retry_after ?? 0) / 60));
        setRemoteErr(`嘗試太多次，請 ${mins} 分鐘後再試`);
      } else {
        setRemoteErr("密碼錯誤");
      }
    } catch {
      setRemoteErr("連線失敗，請稍後再試");
    } finally {
      setRemoteBusy(false);
    }
  }, [pw, remoteBusy, router]);

  const enterRemote = useCallback(() => {
    stopPoll();            // 停掉配對輪詢
    setRemoteErr(null);
    setMode("remote");
  }, [stopPoll]);

  const backToPair = useCallback(() => {
    setPw("");
    setRemoteErr(null);
    setMode("pair");
    requestCode();         // 回配對模式重新取碼、重啟輪詢
  }, [requestCode]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[18px] bg-surface border border-line p-8 shadow-lg shadow-mute/10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fresh-bg text-fresh">
          <Zap className="h-8 w-8" strokeWidth={2} fill="currentColor" />
        </div>
        <h1 className="text-2xl font-bold text-soft mb-2">Smart Home Dashboard</h1>

        {error && ERROR_MESSAGES[error] && phase !== "code" && mode !== "remote" && (
          <div className="mb-6 rounded-[12px] bg-warm-bg border border-warm/30 px-4 py-3 text-sm text-warm">
            {ERROR_MESSAGES[error]}
          </div>
        )}

        {mode === "remote" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRemote();
            }}
          >
            <p className="text-sm text-mute mb-6">輸入遙控器密碼進入</p>
            <input
              type="password"
              autoComplete="off"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="遙控器密碼"
              autoFocus
              className="mb-3 w-full rounded-[12px] border border-line bg-elevated px-4 py-3 text-center text-lg tracking-widest text-foreground outline-none focus:border-cool"
            />
            {remoteErr && <p className="mb-3 text-sm text-warm">{remoteErr}</p>}
            <button
              type="submit"
              disabled={remoteBusy || !pw}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-fresh px-6 py-3.5 text-base font-bold text-white hover:bg-fresh/85 transition-colors disabled:opacity-50"
            >
              <Lock className="h-5 w-5" strokeWidth={2} />
              {remoteBusy ? "驗證中…" : "進入遙控器"}
            </button>
          </form>
        ) : (
          <>
            {phase === "checking" && <p className="mt-6 text-sm text-mute">載入中...</p>}

            {phase === "code" && (
              <>
                <p className="text-sm text-mute mb-6">打開 LINE，把下面這行訊息傳給家庭管家：</p>

                <div className="mb-6 rounded-[14px] bg-elevated border border-line px-4 py-5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-mute mb-2">
                    在 LINE 輸入
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="num min-w-0 text-3xl font-bold tracking-[0.12em] text-foreground">
                      {loginCommand}
                    </p>
                    <button
                      type="button"
                      onClick={copyLoginCommand}
                      title="複製登入訊息"
                      aria-label="複製登入訊息"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-mute transition-colors hover:border-cool hover:text-cool active:scale-95"
                    >
                      {copied ? (
                        <Check className="h-4.5 w-4.5 text-fresh" strokeWidth={2.2} />
                      ) : (
                        <Copy className="h-4.5 w-4.5" strokeWidth={2} />
                      )}
                    </button>
                  </div>
                  {copied && <p className="mt-2 text-[11px] text-fresh">已複製</p>}
                  {copyFailed && <p className="mt-2 text-[11px] text-warm">無法複製</p>}
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-mute">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-fresh animate-pulse" />
                  等待你在 LINE 確認...
                </div>
                <p className="mt-4 text-[11px] text-mute/70">驗證碼 5 分鐘有效，輸入後這裡會自動進入</p>
              </>
            )}

            {phase === "expired" && (
              <>
                <p className="mt-2 mb-6 text-sm text-mute">驗證碼已過期</p>
                <button
                  onClick={requestCode}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-fresh px-6 py-3.5 text-base font-bold text-white hover:bg-fresh/85 transition-colors"
                >
                  <RefreshCw className="h-5 w-5" strokeWidth={2} />
                  重新取得驗證碼
                </button>
              </>
            )}

            {phase === "error" && (
              <>
                <p className="mt-2 mb-6 text-sm text-warm">無法取得驗證碼，請稍後再試</p>
                <button
                  onClick={requestCode}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-fresh px-6 py-3.5 text-base font-bold text-white hover:bg-fresh/85 transition-colors"
                >
                  <RefreshCw className="h-5 w-5" strokeWidth={2} />
                  重試
                </button>
              </>
            )}
          </>
        )}

        <button
          type="button"
          onClick={mode === "remote" ? backToPair : enterRemote}
          className="mt-6 text-xs text-mute/70 underline underline-offset-2 transition-colors hover:text-soft"
        >
          {mode === "remote" ? "← 改用一般登入" : "遙控器模式（輸入密碼）"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
