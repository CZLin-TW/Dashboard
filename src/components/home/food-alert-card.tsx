"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { expiryLabel, foodUrgency, urgencyRowClass } from "@/lib/types";
import type { Food } from "@/lib/api";

interface Props {
  statusText?: string;
  food: Food[];
}

/**
 * 即期食品卡：顯示父層篩好的 5 天內到期或已過期品項。
 * 視覺對齊 food 頁的 list row（品名 + 數量單位 + 期限）；期限文字跟 cls
 * 用共用的 expiryLabel helper。
 */
export function FoodAlertCard({ food, statusText }: Props) {
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
      {statusText ? <p className="text-sm text-mute">{statusText}</p> : food.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {food.map((f) => {
            const exp = expiryLabel(f.expires_on ?? "");
            const urgency = foodUrgency(f.expires_on ?? "");
            const urgencyCls = urgencyRowClass(urgency);
            const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";
            return (
              <li
                key={f.id}
                className={`flex min-h-[68px] items-center gap-3 rounded-2xl px-3 py-3 transition-colors ${urgencyCls} ${hoverCls}`}
              >
                <span className="flex-1 min-w-0 text-sm text-foreground">
                  <span className="block font-medium">{f.name}</span>
                  <span className="num mt-1 block text-xs text-mute">
                    {f.quantity} {f.unit}
                  </span>
                </span>
                <span className={`num flex-shrink-0 text-xs ${exp.cls}`}>{exp.text}</span>
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
