"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { send } from "@/lib/api";
import { PANEL_BASE } from "@/components/ui/device-controls";

/** The household's room order, shared by the whole family. Up/down buttons rather than dragging:
 *  dragging inside a scrolling page is easy to set off by accident on a phone. */
export function RoomOrderEditor({ rooms, onSaved, onClose }: { rooms: string[]; onSaved: () => Promise<void>; onClose: () => void }) {
  const [order, setOrder] = useState(rooms);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const move = (i: number, by: -1 | 1) => setOrder((o) => {
    const next = [...o];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    return next;
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await send("PUT", "rooms/order", { rooms: order });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗，請稍後重試。");
    } finally {
      setSaving(false);
    }
  };

  const arrow = "grid h-9 w-9 place-items-center rounded-[10px] bg-elevated/40 text-foreground transition-colors hover:bg-elevated/60 disabled:opacity-30";
  return (
    <div className={PANEL_BASE}>
      <p className="px-1 text-xs text-mute">全家共用同一個順序。</p>
      <ol className="space-y-1.5">
        {order.map((room, i) => (
          <li key={room} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold text-foreground">{room}</span>
            <button type="button" className={arrow} disabled={saving || i === 0} onClick={() => move(i, -1)} aria-label={`${room}往上`}>
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </button>
            <button type="button" className={arrow} disabled={saving || i === order.length - 1} onClick={() => move(i, 1)} aria-label={`${room}往下`}>
              <ArrowDown className="h-4 w-4" strokeWidth={2} />
            </button>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="px-1 text-xs text-amber-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={saving}
          className="rounded-full px-4 py-1.5 text-xs text-mute transition-colors hover:text-foreground disabled:opacity-40">
          取消
        </button>
        <button type="button" onClick={save} disabled={saving}
          className="rounded-full bg-cool px-4 py-1.5 text-xs font-semibold text-white hover:bg-cool/85 disabled:opacity-40">
          {saving ? "儲存中…" : "完成"}
        </button>
      </div>
    </div>
  );
}
