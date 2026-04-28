"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Zap, MessageCircle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "你取消了登入",
  invalid_state: "驗證失敗，請重試",
  no_code: "登入失敗，請重試",
  token_failed: "LINE 驗證失敗，請重試",
  profile_failed: "無法取得 LINE 資料，請重試",
  not_member: "你不是家庭成員，無法登入",
  sheets_failed: "無法驗證家庭成員，請稍後再試",
  unauthorized: "請先登入",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) router.replace("/");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-mute">載入中...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-mute/15 p-8 shadow-lg shadow-mute/15 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-fresh/15 text-fresh">
          <Zap className="h-8 w-8" strokeWidth={2} fill="currentColor" />
        </div>
        <h1 className="text-2xl font-bold text-soft mb-2">Smart Home Dashboard</h1>
        <p className="text-sm text-mute mb-8">請使用 LINE 帳號登入</p>

        {error && (
          <div className="mb-6 rounded-lg bg-warm/10 border border-warm/30 px-4 py-3 text-sm text-warm">
            {ERROR_MESSAGES[error] ?? "登入失敗，請重試"}
          </div>
        )}

        <a
          href="/api/auth/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#06C755] px-6 py-3.5 text-base font-bold text-white hover:bg-[#05b34d] transition-colors"
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
          使用 LINE 登入
        </a>

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
