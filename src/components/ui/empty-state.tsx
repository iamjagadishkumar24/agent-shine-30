import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable empty-state block. Use inside cards, tables (colSpan cell), or
 * full-page regions. Keeps hierarchy consistent: icon puck → title → body →
 * optional CTA slot.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { wrap: "py-8 gap-2", puck: "h-9 w-9", icon: "h-4 w-4", title: "text-sm" },
  md: { wrap: "py-12 gap-3", puck: "h-11 w-11", icon: "h-5 w-5", title: "text-base" },
  lg: { wrap: "py-16 gap-4", puck: "h-14 w-14", icon: "h-6 w-6", title: "text-lg" },
} as const;

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, description, action, size = "md", className, ...props }, ref) => {
    const s = sizes[size];
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(
          "flex flex-col items-center justify-center text-center",
          s.wrap,
          className,
        )}
        {...props}
      >
        {Icon ? (
          <div
            aria-hidden
            className={cn(
              "grid place-items-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground shadow-xs",
              s.puck,
            )}
          >
            <Icon className={s.icon} />
          </div>
        ) : null}
        <div className="max-w-sm space-y-1">
          <p className={cn("font-semibold tracking-tight text-foreground", s.title)}>{title}</p>
          {description ? (
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    );
  },
);
EmptyState.displayName = "EmptyState";
