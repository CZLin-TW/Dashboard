"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { type FoodData, expiryLabel, foodUrgency, urgencyRowClass } from "@/lib/types";

interface Props {
  food: FoodData[];
}

/**
 * 即期食品卡：顯示父層篩好的 5 天內到期或已過期品項。
 * 視覺對齊 food 頁的 list row（品名 + 數量單位 + 期限）；期限文字跟 cls
 * 用共用的 expiryLabel helper。
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
            const exp = expiryLabel(f["過期日"]);
            const urgency = foodUrgency(f["過期日"]);
            const urgencyCls = urgencyRowClass(urgency);
            const hoverCls = urgencyCls ? "" : "hover:bg-elevated/50";
            return (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-[12px] px-2 py-1.5 transition-colors ${urgencyCls} ${hoverCls}`}
              >
                <span className="flex-1 min-w-0 text-sm text-foreground">
                  <span className="font-semibold">{f["品名"]}</span>
                  <span className="num ml-1.5 text-mute">
                    {f["數量"]} {f["單位"]}
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
