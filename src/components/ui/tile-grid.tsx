"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Collapse } from "@/components/ui/collapse";

// ─────────────────────────────────────────────────────────────
// 方塊與「點了在那一排下面展開」：裝置頁的設備、環境感測，首頁的常用設備共用。
// 小方塊比照 Apple 家庭的小方塊：圓形圖示在左、名稱與狀態在右；在運轉／有狀況的「亮起來」（實心＋上色圖示），
// 關著的退成透明外框，一眼看得出哪幾個需要注意。
// ─────────────────────────────────────────────────────────────

export type TileTone = "off" | "unknown" | "cool" | "teal" | "fresh" | "warm" | "temp" | "amber";

const ICON_TONE: Record<TileTone, string> = {
  off: "bg-elevated text-mute",
  unknown: "bg-elevated text-faint",
  cool: "bg-cool text-white",
  teal: "bg-[var(--color-chart-memory)] text-white",
  fresh: "bg-fresh text-white",
  warm: "bg-warm text-white",
  temp: "bg-[var(--color-chart-temperature)] text-white",
  amber: "bg-amber text-white",
};

interface CompactTileProps {
  icon: LucideIcon;
  tone: TileTone;
  /** Solid tile (running / worth a look) rather than an outline. */
  lit: boolean;
  title: string;
  /** Second line: an optional bold reading, then words. */
  value?: string | null;
  text?: ReactNode;
  /** Optional third line (schedules, problems). */
  note?: ReactNode;
  /** Small mark on the icon's corner. */
  badge?: ReactNode;
  /** Makes it a button that opens something; `active` while open. */
  onClick?: () => void;
  active?: boolean;
  /** Shows a chevron (rows that open in place, rather than a panel under the row). */
  chevron?: boolean;
  dataKey?: string;
}

export function CompactTile({ icon: Icon, tone, lit, title, value, text, note, badge, onClick, active = false, chevron = false, dataKey }: CompactTileProps) {
  const reduceMotion = useReducedMotion();
  const className = `relative flex min-h-[68px] w-full min-w-0 items-center gap-3 rounded-[20px] border px-3 py-2.5 text-left transition-colors duration-200 ${
    active ? "border-cool bg-cool-bg shadow-[0_0_0_1px_var(--color-cool)]"
      : lit ? "border-transparent bg-surface shadow-[0_4px_14px_-8px_rgba(31,36,43,0.25)]"
      : `border-line/70 bg-transparent ${onClick ? "hover:bg-surface/60" : ""}`
  }`;
  const body = (
    <>
      <span className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${ICON_TONE[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
        {badge && <span className="absolute -right-1 -top-1">{badge}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[14px] font-semibold leading-tight ${lit || active ? "text-foreground" : "text-soft"}`} title={title}>{title}</span>
        {(value || text) && (
          <span className="mt-1 flex min-w-0 items-baseline gap-1 text-[12px] leading-tight text-mute">
            {value && <span className={`num shrink-0 font-semibold ${lit ? "text-foreground" : ""}`}>{value}</span>}
            {text && <span className="truncate">{text}</span>}
          </span>
        )}
        {note && <span className="mt-1 truncate text-[11px] leading-tight">{note}</span>}
      </span>
      {chevron && <ChevronDown className={`h-4 w-4 shrink-0 text-mute transition-transform ${active ? "rotate-180" : ""}`} />}
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <motion.button type="button" onClick={onClick} aria-expanded={active} data-tile={dataKey}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={className}>
      {body}
    </motion.button>
  );
}

/** The corner mark: a red one for something to check, a quiet one for information (e.g. a schedule). */
export function TileBadge({ icon: Icon, alert }: { icon: LucideIcon; alert: boolean }) {
  return (
    <span className={`grid h-[18px] w-[18px] place-items-center rounded-full ring-2 ring-background ${alert ? "bg-warm text-white" : "bg-amber-bg text-amber"}`}>
      <Icon className="h-2.5 w-2.5" strokeWidth={2.6} />
    </span>
  );
}

/** A full-width tile that opens its content right below it (automations, computers). */
export function ExpandRow({ children, ...tile }: Omit<CompactTileProps, "onClick" | "active" | "chevron"> & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <CompactTile {...tile} onClick={() => setOpen((v) => !v)} active={open} chevron />
      <Collapse open={open}><div className="pt-3">{children}</div></Collapse>
    </div>
  );
}

interface TileGridProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  /** The open item's key (may belong to another grid on the page), or null. */
  expanded: string | null;
  renderTile: (item: T, active: boolean) => ReactNode;
  renderPanel: (item: T) => ReactNode;
  /** Columns on a phone / from the `sm` breakpoint. */
  cols?: [2, 2 | 3 | 4];
}

/**
 * Tiles in rows; the open one's panel goes right under its row (not an overlay), so it is clear which tile it belongs to.
 * Switching closes the old panel first and opens the new one when that animation ends.
 * Phone and wide screens break rows differently, so both layouts are rendered and one is hidden by CSS.
 * The panel sits after the row (outside the grid) so the grid `gap` does not jump while the height animates.
 */
export function TileGrid<T>({ items, keyOf, expanded, renderTile, renderPanel, cols = [2, 4] }: TileGridProps<T>) {
  const [shown, setShown] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const mine = expanded !== null && items.some((item) => keyOf(item) === expanded) ? expanded : null;
  // Nothing on screen (or the shown item left the list): open directly, there is no closing animation to wait for.
  if (shown !== mine && (shown === null || !items.some((item) => keyOf(item) === shown))) setShown(mine);
  const open = shown !== null && shown === mine ? items.find((item) => keyOf(item) === shown) ?? null : null;

  function renderRows(n: number, viewportClass: string) {
    const rows: T[][] = [];
    for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
    const gridCols = n === 2 ? "grid-cols-2" : n === 3 ? "grid-cols-3" : "grid-cols-4";
    return (
      <div className={`${viewportClass} space-y-3`}>
        {rows.map((row, rowIdx) => {
          const rowHasOpen = !!open && row.some((item) => keyOf(item) === keyOf(open));
          return (
            <div key={rowIdx}>
              <div className={`grid ${gridCols} items-stretch gap-3`}>
                {row.map((item) => <div key={keyOf(item)} className="flex min-w-0 [&>*]:flex-1">{renderTile(item, mine === keyOf(item))}</div>)}
              </div>
              <AnimatePresence initial={false} onExitComplete={() => setShown(mine)}>
                {rowHasOpen && open && (
                  <motion.div
                    key="panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      height: { duration: reduceMotion ? 0 : 0.28, ease: [0.32, 0.72, 0, 1] },
                      opacity: { duration: reduceMotion ? 0 : 0.18, ease: "easeOut" },
                    }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3">{renderPanel(open)}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {renderRows(cols[0], "sm:hidden")}
      {renderRows(cols[1], "hidden sm:block")}
    </>
  );
}
