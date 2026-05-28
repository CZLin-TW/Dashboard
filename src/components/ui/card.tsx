import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-line bg-surface p-4 shadow-sm shadow-mute/10 overflow-hidden",
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
    <div className={cn("mb-2.5 flex items-center justify-between", className)} {...props}>
      {children}
    </div>
  );
}

/** Card 標題：sub-heading 樣態（page title 才是 h1 大字）。預設 flex+gap，配合左側 lucide icon。 */
export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("flex items-center gap-2 text-sm font-semibold text-mute", className)} {...props}>
      {children}
    </h3>
  );
}
