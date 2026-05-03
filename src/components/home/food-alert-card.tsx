"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { type FoodData, daysUntilExpiry } from "./types";

interface Props {
  food: FoodData[];
}

function expiryText(days: number): string {
  if (days < 0) return "已過期";
  if (days === 0) return "今天到期";
  if (days === 1) return "明天到期";
  return `${days} 天後到期`;
}

/**
 * 即期食品卡：顯示 3 天內到期或已過期的品項。
 * 父層應只傳入 urgent 過濾後的 food，這個元件不再過濾。
 *
 * 視覺對齊 food 頁的 list row（品名 + 數量單位 + 期限 pill）。
 */
export function FoodAlertCard({ food }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <AlertTriangle className="h-4 w-4 text-warm" strokeWidth={2} />
          即期食品
        </CardTitle>
        <Link href="/food" className="text-sm text-cool hover:text-cool/80">
          查看全部 →
        </Link>
      </CardHeader>
      {food.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {food.map((f, i) => {
            const days = daysUntilExpiry(f["過期日"]);
            return (
              <li
                key={i}
                className="flex items-center gap-3 rounded-[12px] px-2 py-1.5 hover:bg-elevated/50 transition-colors"
              >
                <span className="flex-1 min-w-0 text-sm text-foreground">
                  <span className="font-semibold">{f["品名"]}</span>
                  <span className="num ml-1.5 text-mute">
                    {f["數量"]} {f["單位"]}
                  </span>
                </span>
                <span className="num flex-shrink-0 text-xs font-semibold text-warm">
                  {expiryText(days)}
                </span>
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
