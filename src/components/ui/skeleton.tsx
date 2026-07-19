import { cn } from "@/lib/utils";

/**
 * Base skeleton: subtle two-tone shimmer that reads on both themes without
 * flashing. Prefer this over ad-hoc `animate-pulse` divs.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
