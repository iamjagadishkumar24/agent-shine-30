import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runHealthChecks, type HealthCheck } from "@/lib/health.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

function safeDateTime(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}


export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({ meta: [{ title: "Health · Zenwork Performance Manager" }] }),
  component: HealthPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-8">
      <div className="text-sm text-destructive">{error.message}</div>
      <Button size="sm" variant="outline" className="mt-3" onClick={reset}>Retry</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

const STATUS_ICON = {
  ok: { Icon: CheckCircle2, cls: "text-emerald-500" },
  warn: { Icon: AlertTriangle, cls: "text-amber-500" },
  fail: { Icon: XCircle, cls: "text-destructive" },
} as const;

function HealthPage() {
  const run = useServerFn(runHealthChecks);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const { data, isFetching, refetch, error, dataUpdatedAt } = useQuery({
    queryKey: ["health-checks"],
    queryFn: () => run(),
    staleTime: 0,
    refetchInterval: autoRefresh ? 30_000 : false,
  });


  const grouped = (data?.checks ?? []).reduce<Record<string, HealthCheck[]>>((acc, c) => {
    (acc[c.module] ||= []).push(c);
    return acc;
  }, {});

  const overall = data
    ? data.summary.fail > 0
      ? "fail"
      : data.summary.warn > 0
        ? "warn"
        : "ok"
    : "ok";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
          <p className="text-sm text-muted-foreground">
            Live diagnostics for APIs, database, auth, storage, email, and AI services.
          </p>
        </div>
        <Button
          size="sm"
          variant={autoRefresh ? "default" : "outline"}
          onClick={() => setAutoRefresh((v) => !v)}
          aria-pressed={autoRefresh}
        >
          {autoRefresh ? <Pause className="h-3.5 w-3.5 mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
          Auto-refresh
        </Button>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isFetching && "animate-spin")} />
          Run checks
        </Button>
      </div>

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          {(error as Error).message}
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Overall" value={overall.toUpperCase()} tone={overall} />
          <SummaryTile label="Passing" value={String(data.summary.ok)} tone="ok" />
          <SummaryTile label="Warnings" value={String(data.summary.warn)} tone="warn" />
          <SummaryTile label="Failures" value={String(data.summary.fail)} tone="fail" />
        </div>
      )}

      {isFetching && !data && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted/40" />
          ))}
        </div>
      )}

      <div className="space-y-6" aria-live="polite">
        {data && Object.keys(grouped).length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No health checks reported.</Card>
        )}
        {Object.entries(grouped).map(([module, checks]) => (
          <div key={module}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {module}
            </h2>
            <Card className="divide-y divide-border/60">
              {checks.map((c) => {
                const { Icon, cls } = STATUS_ICON[c.status];
                return (
                  <div key={c.id} className="flex items-start gap-3 p-4">
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", cls)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{c.name}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] uppercase",
                            c.status === "ok" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
                            c.status === "warn" && "border-amber-500/40 text-amber-600 dark:text-amber-400",
                            c.status === "fail" && "border-destructive/40 text-destructive",
                          )}
                        >
                          {c.status}
                        </Badge>
                        {typeof c.latencyMs === "number" && (
                          <span className="text-[10px] text-muted-foreground">{c.latencyMs} ms</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 break-words">{c.message}</div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))}
      </div>

      {data && (
        <p className="text-[11px] text-muted-foreground">
          Last checked {safeDateTime(data.generatedAt) ?? safeDateTime(new Date(dataUpdatedAt).toISOString()) ?? "just now"}
          {autoRefresh && " · auto-refreshing every 30s"}
        </p>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "fail" }) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-destructive";
  return (
    <Card className="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
    </Card>
  );
}
