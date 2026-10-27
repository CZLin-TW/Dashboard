"use client";

import { useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Collapse } from "./collapse";
import { IconActionButton } from "./device-controls";

export interface RowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "danger";
}

/**
 * A list row (todos, food) that stays two lines on a phone (v1.85.0): on a phone the row's actions sit behind "⋯"
 * and open as buttons right under the row (the same tap-to-open as the tiles); on wider screens they are icons.
 */
export function ListRow({ as: Tag = "li", className = "", children, trailing, actions }: { as?: "li" | "div"; className?: string;
  children: ReactNode; trailing?: ReactNode; actions?: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const has = !!actions?.length;
  return (
    <Tag className={`rounded-[12px] px-3 py-2.5 ${className}`}>
      <div className="flex items-center gap-3">
        {children}
        {trailing}
        {has && (
          <>
            <div className="hidden items-center gap-1 sm:flex">
              {actions.map((a) => <IconActionButton key={a.label} onClick={a.onClick} tone={a.tone} title={a.label} icon={a.icon} />)}
            </div>
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="更多動作" title="更多動作"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors sm:hidden ${open ? "bg-elevated text-soft" : "text-mute"}`}>
              <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
            </button>
          </>
        )}
      </div>
      {has && (
        <Collapse open={open} className="sm:hidden">
          <div className="flex justify-end gap-2 pt-2">
            {actions.map((a) => (
              <button key={a.label} type="button" onClick={() => { setOpen(false); a.onClick(); }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${
                  a.tone === "danger" ? "bg-warm-bg text-warm" : "bg-elevated text-soft"}`}>
                {a.icon}{a.label}
              </button>
            ))}
          </div>
        </Collapse>
      )}
    </Tag>
  );
}
