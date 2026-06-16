"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Zap, RefreshCw, Copy, Check } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  not_member: "你不是家庭成員，無法登入",
  unauthorized: "登入已過期，請重新登入",
};

type Phase = "checking" | "code" | "expired" | "error";

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

  const [phase, setPhase] = useState<Phase>("checking");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
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
      const res = await fetch("/api/auth/device-code", { method: "POST" });
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
            router.replace("/");
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
  }, [router, stopPoll]);

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
  const loginCommand = code ? `登入 ${codeDisplay}` : "";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[18px] bg-surface border border-line p-8 shadow-lg shadow-mute/10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fresh-bg text-fresh">
          <Zap className="h-8 w-8" strokeWidth={2} fill="currentColor" />
        </div>
        <h1 className="text-2xl font-bold text-soft mb-2">Smart Home Dashboard</h1>

        {error && ERROR_MESSAGES[error] && phase !== "code" && (
          <div className="mb-6 rounded-[12px] bg-warm-bg border border-warm/30 px-4 py-3 text-sm text-warm">
            {ERROR_MESSAGES[error]}
          </div>
        )}

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

        <p className="mt-6 text-xs text-mute/70">僅限家庭成員登入</p>
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
