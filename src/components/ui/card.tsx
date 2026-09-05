import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-line/80 bg-surface p-5 shadow-[0_3px_16px_-8px_rgba(31,36,43,0.12)] overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)} {...props}>
      {children}
    </div>
  );
}

/** Card 標題：sub-heading 樣態（page title 才是 h1 大字）。預設 flex+gap，配合左側 lucide icon。 */
export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("flex items-center gap-2 text-sm font-semibold text-soft", className)} {...props}>
      {children}
    </h3>
  );
}
