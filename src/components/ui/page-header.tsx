import type { ReactNode } from "react";

/**
 * Every page's title (v1.84.0): a large title like the home page's, an optional small line above (greeting)
 * or below (status), and the page's main button on the right. No icon: the navigation already shows it.
 */
export function PageHeader({ title, eyebrow, subtitle, actions }: { title: string; eyebrow?: ReactNode; subtitle?: ReactNode;
  actions?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-sm text-mute">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground md:text-[32px]">{title}</h1>
        {subtitle && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-mute">{subtitle}</div>}
      </div>
      {actions && <div className="mb-1 flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
