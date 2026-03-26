"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";

const FAH_URL = "https://v8-5.foldingathome.org/machines";

export default function FahPage() {
  const [iframeError, setIframeError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const refreshIframe = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🧬 Folding@Home</h1>
        <div className="flex gap-2">
          <button
            onClick={refreshIframe}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            重新整理
          </button>
          <a
            href={FAH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            新分頁開啟 ↗
          </a>
        </div>
      </div>

      {!iframeError ? (
        <Card className="overflow-hidden p-0">
          <iframe
            key={iframeKey}
            src={FAH_URL}
            title="Folding@Home Machines"
            className="h-[600px] w-full md:h-[750px] border-0 rounded-xl"
            onError={() => setIframeError(true)}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </Card>
      ) : (
        <Card className="text-center py-12">
          <p className="text-gray-400 mb-4">
            無法嵌入 Folding@Home 頁面（可能被該網站阻擋）
          </p>
          <a
            href={FAH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            前往 Folding@Home 查看 ↗
          </a>
        </Card>
      )}

      <p className="text-center text-xs text-gray-600">
        如果畫面顯示登入頁面，請先登入你的 Folding@Home 帳號。點「重新整理」更新狀態。
      </p>
    </div>
  );
}
