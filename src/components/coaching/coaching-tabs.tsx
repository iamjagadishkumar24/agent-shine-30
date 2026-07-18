import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function CoachingTabs() {
  const { pathname } = useLocation();
  const onPlans = pathname.startsWith("/coaching/plans");
  const tabs = [
    { to: "/coaching", label: "Sessions", active: !onPlans },
    { to: "/coaching/plans", label: "Plans & goals", active: onPlans },
  ] as const;
  return (
    <div className="mx-auto max-w-6xl px-8 pt-2">
      <div
        role="tablist"
        aria-label="Coaching sections"
        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs"
      >
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            role="tab"
            aria-selected={t.active}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "rounded px-2.5 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              t.active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
