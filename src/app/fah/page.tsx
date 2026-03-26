"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

const FAH_URL = "https://v8-5.foldingathome.org/machines";

export default function FahPage() {
  const [iframeError, setIframeError] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🧬 Folding@Home</h1>
        <a
          href={FAH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          在新分頁開啟 ↗
        </a>
      </div>

      {!iframeError ? (
        <Card className="overflow-hidden p-0">
          <iframe
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
        如果畫面顯示登入頁面，請先登入你的 Folding@Home 帳號
      </p>
    </div>
  );
}
