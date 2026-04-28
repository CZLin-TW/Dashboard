"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { type FoodData, daysUntilExpiry } from "./types";

interface Props {
  food: FoodData[];
}

/**
 * 即期食品卡：顯示 3 天內到期或已過期的品項。
 * 父層應只傳入 urgent 過濾後的 food，這個元件不再過濾。
 */
export function FoodAlertCard({ food }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-warm" strokeWidth={2} />
          即期食品
        </CardTitle>
        <Link href="/food" className="text-sm text-cool hover:text-cool/80">
          查看全部 →
        </Link>
      </CardHeader>
      {food.length > 0 ? (
        <ul className="space-y-2">
          {food.map((f, i) => {
            const days = daysUntilExpiry(f["過期日"]);
            const label = days === 0 ? "今天到期" : days === 1 ? "明天到期" : `${days}天後到期`;
            return (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-soft">{f["品名"]} {f["數量"]}{f["單位"]}</span>
                <span className="text-xs text-warm">{label}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-mute">沒有即期食品</p>
      )}
    </Card>
  );
}
