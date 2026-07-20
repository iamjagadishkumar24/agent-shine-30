import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays, startOfYear } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  AlertCircle,
  Mail,
  ArrowRight,
  CalendarIcon,
  RefreshCw,
  Radio,
} from "lucide-react";

const Charts = lazy(() => import("@/components/analytics/analytics-charts"));

function parseTime(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

type FeedbackRow = {
  id: string;
  status: string;
  feedback_type: string | null;
  severity: string | null;
  score: number | null;
  created_at: string;
  agent_id: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
};

type AgentRow = { id: string; full_name: string | null; qa_score: number | null };

// ── Search params ────────────────────────────────────────────────────────────
const searchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  preset: fallback(z.string(), "30d").default("30d"),
});

type Preset = { key: string; label: string; days?: number; ytd?: boolean; all?: boolean };
const PRESETS: Preset[] = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "ytd", label: "Year to date", ytd: true },
  { key: "all", label: "All time", all: true },
  { key: "custom", label: "Custom" },
];

function resolveRange(preset: string, from: string, to: string): { start: Date; end: Date; all: boolean } {
  const now = new Date();
  const endDefault = endOfDay(now);
  const p = PRESETS.find((x) => x.key === preset);
  if (p?.all) return { start: new Date(0), end: endDefault, all: true };
  if (p?.ytd) return { start: startOfYear(now), end: endDefault, all: false };
  if (p?.days) return { start: startOfDay(subDays(now, p.days - 1)), end: endDefault, all: false };
  // custom
  const parsedFrom = from ? new Date(from) : null;
  const parsedTo = to ? new Date(to) : null;
  const start = parsedFrom && !isNaN(parsedFrom.getTime()) ? startOfDay(parsedFrom) : startOfDay(subDays(now, 29));
  const end = parsedTo && !isNaN(parsedTo.getTime()) ? endOfDay(parsedTo) : endDefault;
  return { start, end, all: false };
}

function useAnalyticsData(start: Date, end: Date, all: boolean) {
  const key = ["analytics", "core", all ? "all" : start.toISOString(), all ? "all" : end.toISOString()];
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      let fb = supabase
        .from("feedback")
        .select(
          "id, status, feedback_type, severity, score, created_at, agent_id, delivered_at, opened_at, acknowledged_at",
        )
        .order("created_at", { ascending: false })
        .limit(5000);
      if (!all) {
        fb = fb.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      }
      const [fbRes, agRes] = await Promise.all([
        fb,
        supabase.from("agents").select("id, full_name, qa_score").limit(2000),
      ]);
      if (fbRes.error) throw fbRes.error;
      if (agRes.error) throw agRes.error;
      return {
        feedback: (fbRes.data ?? []) as unknown as FeedbackRow[],
        agents: (agRes.data ?? []) as unknown as AgentRow[],
      };
    },
    staleTime: 15_000,
  });
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

export const Route = createFileRoute("/_authenticated/analytics")({
  validateSearch: zodValidator(searchSchema),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/analytics" });

  const { start, end, all } = useMemo(
    () => resolveRange(search.preset, search.from, search.to),
    [search.preset, search.from, search.to],
  );
  const rangeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 864e5));

  // Realtime — invalidate every analytics query on any feedback change.
  useRealtimeInvalidate("feedback", [["analytics"]]);
  useRealtimeInvalidate("feedback_scores", [["analytics"]]);
  useRealtimeInvalidate("agents", [["analytics"]]);

  const { data, isLoading, isError, error, refetch, isFetching } = useAnalyticsData(start, end, all);
  const feedback = data?.feedback ?? [];
  const agents = data?.agents ?? [];

  const metrics = useMemo(() => {
    const total = feedback.length;
    const sent = feedback.filter((f) => ["sent", "acknowledged", "completed"].includes(f.status)).length;
    const delivered = feedback.filter((f) => f.delivered_at).length;
    const opened = feedback.filter((f) => f.opened_at).length;
    const acknowledged = feedback.filter((f) => f.acknowledged_at).length;
    const scored = feedback.filter((f) => f.score != null);
    const avgScore = scored.length ? scored.reduce((s, f) => s + Number(f.score ?? 0), 0) / scored.length : 0;

    // Trailing window vs prior window of equal length (for delta on current range).
    const windowMs = end.getTime() - start.getTime();
    const prevStart = start.getTime() - windowMs;
    const prevEnd = start.getTime();
    const inWindow = feedback.filter((f) => {
      const t = parseTime(f.created_at);
      return t != null && t >= start.getTime() && t <= end.getTime();
    }).length;
    const prevWindow = feedback.filter((f) => {
      const t = parseTime(f.created_at);
      return t != null && t >= prevStart && t < prevEnd;
    }).length;
    // Note: for the "all" preset the prev-window comparison isn't meaningful.
    const delta = all
      ? 0
      : prevWindow === 0
        ? inWindow
          ? 100
          : 0
        : Math.round(((inWindow - prevWindow) / prevWindow) * 100);

    return { total, sent, delivered, opened, acknowledged, avgScore, inWindow, delta };
  }, [feedback, start, end, all]);

  // Bucket into daily buckets for <= 60 day windows, otherwise monthly.
  const trend = useMemo(() => {
    const useDaily = !all && rangeDays <= 60;
    const buckets = new Map<string, { label: string; count: number; scoreSum: number; scoreN: number }>();
    if (useDaily) {
      for (let i = 0; i < rangeDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = format(d, "yyyy-MM-dd");
        buckets.set(key, { label: format(d, "MMM d"), count: 0, scoreSum: 0, scoreN: 0 });
      }
    } else {
      const first = all
        ? feedback.reduce<Date | null>((acc, f) => {
            const t = parseTime(f.created_at);
            if (t == null) return acc;
            const d = new Date(t);
            return acc == null || d < acc ? d : acc;
          }, null) ?? subDays(new Date(), 335)
        : start;
      const startMonth = new Date(first.getFullYear(), first.getMonth(), 1);
      const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      const cur = new Date(startMonth);
      while (cur <= endMonth) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, { label: format(cur, "MMM yy"), count: 0, scoreSum: 0, scoreN: 0 });
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    for (const f of feedback) {
      const t = parseTime(f.created_at);
      if (t == null) continue;
      const d = new Date(t);
      const key = useDaily
        ? format(d, "yyyy-MM-dd")
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (!b) continue;
      b.count += 1;
      if (f.score != null) {
        b.scoreSum += Number(f.score);
        b.scoreN += 1;
      }
    }
    return Array.from(buckets.values()).map((b) => ({
      label: b.label,
      count: b.count,
      avgScore: b.scoreN ? Number((b.scoreSum / b.scoreN).toFixed(2)) : 0,
    }));
  }, [feedback, start, end, all, rangeDays]);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of feedback) {
      const k = (f.feedback_type ?? "other").replace(/_/g, " ");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [feedback]);

  const bySeverity = useMemo(() => {
    const order = ["critical", "high", "medium", "low"];
    const m = new Map<string, number>();
    for (const f of feedback) m.set(f.severity ?? "unset", (m.get(f.severity ?? "unset") ?? 0) + 1);
    return order.map((k) => ({ label: k, value: m.get(k) ?? 0 })).filter((x) => x.value > 0);
  }, [feedback]);

  const topAgents = useMemo(() => {
    const nameById = new Map(agents.map((a) => [a.id, a.full_name ?? "Unassigned"]));
    const counts = new Map<string, { name: string; count: number; scoreSum: number; scoreN: number }>();
    for (const f of feedback) {
      const id = f.agent_id ?? "unassigned";
      const name = nameById.get(id) ?? "Unassigned";
      const c = counts.get(id) ?? { name, count: 0, scoreSum: 0, scoreN: 0 };
      c.count += 1;
      if (f.score != null) {
        c.scoreSum += Number(f.score);
        c.scoreN += 1;
      }
      counts.set(id, c);
    }
    return Array.from(counts.values())
      .filter((c) => c.name !== "Unassigned")
      .map((c) => ({
        name: c.name,
        count: c.count,
        avgScore: c.scoreN ? Number((c.scoreSum / c.scoreN).toFixed(2)) : null,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [feedback, agents]);

  type S = z.infer<typeof searchSchema>;
  const [drill, setDrill] = useState<DrillKey | null>(null);
  const setPreset = (key: string) => {
    navigate({ search: (prev: S) => ({ ...prev, preset: key, from: "", to: "" }) });
  };
  const setCustom = (fromDate?: Date, toDate?: Date) => {
    navigate({
      search: (prev: S) => ({
        ...prev,
        preset: "custom",
        from: fromDate ? format(fromDate, "yyyy-MM-dd") : prev.from,
        to: toDate ? format(toDate, "yyyy-MM-dd") : prev.to,
      }),
    });
  };

  const filterBar = (
    <FilterBar
      preset={search.preset}
      start={start}
      end={end}
      all={all}
      onPreset={setPreset}
      onCustom={setCustom}
      onRefresh={() => refetch()}
      isFetching={isFetching}
    />
  );

  if (isError) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Deep trends across feedback, delivery, and agent performance." />
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 md:px-8">
          {filterBar}
          <Card className="mt-4 rounded-xl border-destructive/50 bg-destructive/5 p-8 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
            <h2 className="mt-3 text-sm font-medium">Couldn't load analytics</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {(error as Error)?.message ?? "Please retry in a moment."}
            </p>
            <Button size="sm" className="mt-4" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Retrying…" : "Retry"}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Deep trends across feedback, delivery, and agent performance."
        actions={
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
            <Link to="/analytics/email">
              <Mail className="h-3.5 w-3.5" /> Email analytics <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-12 pt-6 md:px-8">
        {filterBar}

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-72 rounded-xl" />
            </div>
          </div>
        ) : feedback.length === 0 ? (
          <Card className="rounded-xl border-border/60 bg-card/60 p-10 text-center">
            <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-medium">No feedback in this range</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Try widening the date range, or create feedback to populate analytics.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreset("all")}>
                View all time
              </Button>
              <Button size="sm" asChild>
                <Link to="/feedback/new">Create feedback</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard
                label="Total feedback"
                value={metrics.total.toLocaleString()}
                hint={all ? "All time" : `${metrics.inWindow.toLocaleString()} in window`}
                delta={all ? undefined : metrics.delta}
                icon={<BarChart3 className="h-4 w-4" />}
                onClick={() => setDrill("total")}
              />
              <KpiCard
                label="Avg Quality score"
                value={metrics.avgScore ? metrics.avgScore.toFixed(2) : "—"}
                hint={`${feedback.filter((f) => f.score != null).length.toLocaleString()} scored`}
                icon={<Target className="h-4 w-4" />}
                onClick={() => setDrill("scored")}
              />
              <KpiCard
                label="Delivery rate"
                value={`${pct(metrics.delivered, metrics.sent)}%`}
                hint={`${metrics.delivered.toLocaleString()} / ${metrics.sent.toLocaleString()} sent`}
                icon={<TrendingUp className="h-4 w-4" />}
                onClick={() => setDrill("delivered")}
              />
              <KpiCard
                label="Acknowledgement rate"
                value={`${pct(metrics.acknowledged, metrics.delivered)}%`}
                hint={`${metrics.acknowledged.toLocaleString()} acknowledged`}
                icon={<Users className="h-4 w-4" />}
                onClick={() => setDrill("acknowledged")}
              />
            </div>

            <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
              <Charts monthly={trend} byType={byType} bySeverity={bySeverity} />
            </Suspense>

            <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Top agents by feedback volume</div>
                  <div className="text-xs text-muted-foreground">
                    {all ? "Highest engagement over the entire history." : `Within ${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}.`}
                  </div>
                </div>
                <Link to="/agents" className="text-xs font-medium text-primary hover:underline">
                  View all →
                </Link>
              </div>
              {topAgents.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No assigned feedback in this range.</div>
              ) : (
                <div className="space-y-2">
                  {topAgents.map((a) => {
                    const max = topAgents[0]?.count ?? 1;
                    const width = Math.max(4, Math.round((a.count / max) * 100));
                    return (
                      <div key={a.name} className="grid grid-cols-[1fr_auto] items-center gap-4">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium">{a.name}</span>
                            <span className="text-muted-foreground">
                              {a.count.toLocaleString()} · {a.avgScore != null ? `avg ${a.avgScore}` : "no scores"}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
      <DrillSheet
        drill={drill}
        onClose={() => setDrill(null)}
        feedback={feedback}
        agents={agents}
      />
    </div>
  );
}

function FilterBar({
  preset,
  start,
  end,
  all,
  onPreset,
  onCustom,
  onRefresh,
  isFetching,
}: {
  preset: string;
  start: Date;
  end: Date;
  all: boolean;
  onPreset: (key: string) => void;
  onCustom: (from?: Date, to?: Date) => void;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const rangeLabel = all
    ? "All time"
    : `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;

  return (
    <Card className="rounded-xl border-border/60 bg-card/60 p-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.filter((p) => p.key !== "custom").map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => onPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Popover open={fromOpen} onOpenChange={setFromOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-7 justify-start text-xs font-normal", preset !== "custom" && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {preset === "custom" && !all ? format(start, "MMM d, yyyy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={preset === "custom" ? start : undefined}
                  onSelect={(d) => {
                    if (d) {
                      onCustom(d, end);
                      setFromOpen(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <span className="text-xs text-muted-foreground">–</span>

            <Popover open={toOpen} onOpenChange={setToOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-7 justify-start text-xs font-normal", preset !== "custom" && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {preset === "custom" && !all ? format(end, "MMM d, yyyy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={preset === "custom" ? end : undefined}
                  onSelect={(d) => {
                    if (d) {
                      onCustom(start, d);
                      setToOpen(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="hidden items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 md:flex">
            <Radio className="h-3 w-3 animate-pulse" /> Live
          </div>

          <Button size="sm" variant="outline" className="h-7" onClick={onRefresh} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground">
        Showing <span className="font-medium text-foreground">{rangeLabel}</span>
      </div>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  hint,
  delta,
  icon,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const trendPositive = (delta ?? 0) >= 0;
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "rounded-xl border-border/60 bg-card/60 p-4 backdrop-blur-xl transition",
        onClick && "cursor-pointer hover:border-primary/40 hover:bg-card/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
      )}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 ${
              trendPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            }`}
          >
            {trendPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
        {onClick && <span className="ml-auto text-primary">View →</span>}
      </div>
    </Card>
  );
}

// ── Drill-down ───────────────────────────────────────────────────────────────
type DrillKey = "total" | "scored" | "delivered" | "acknowledged";

const DRILL_META: Record<DrillKey, { title: string; description: string }> = {
  total: {
    title: "All feedback",
    description: "Every feedback record inside the selected date range.",
  },
  scored: {
    title: "Scored feedback",
    description: "Feedback records that contributed to the average Quality score.",
  },
  delivered: {
    title: "Delivered feedback",
    description: "Records sent and confirmed as delivered by the email provider.",
  },
  acknowledged: {
    title: "Acknowledged feedback",
    description: "Records the agent has opened and acknowledged.",
  },
};

function filterDrill(rows: FeedbackRow[], key: DrillKey): FeedbackRow[] {
  switch (key) {
    case "total":
      return rows;
    case "scored":
      return rows.filter((r) => r.score != null);
    case "delivered":
      return rows.filter((r) => r.delivered_at);
    case "acknowledged":
      return rows.filter((r) => r.acknowledged_at);
  }
}

function DrillSheet({
  drill,
  onClose,
  feedback,
  agents,
}: {
  drill: DrillKey | null;
  onClose: () => void;
  feedback: FeedbackRow[];
  agents: AgentRow[];
}) {
  const open = drill !== null;
  const nameById = useMemo(() => new Map(agents.map((a) => [a.id, a.full_name ?? "Unassigned"])), [agents]);
  const rows = useMemo(() => (drill ? filterDrill(feedback, drill) : []), [feedback, drill]);
  const meta = drill ? DRILL_META[drill] : null;

  const downloadCsv = () => {
    const header = [
      "id",
      "created_at",
      "agent",
      "type",
      "severity",
      "status",
      "score",
      "delivered_at",
      "opened_at",
      "acknowledged_at",
    ];
    const lines = rows.map((r) =>
      [
        r.id,
        r.created_at,
        nameById.get(r.agent_id ?? "") ?? "",
        r.feedback_type ?? "",
        r.severity ?? "",
        r.status,
        r.score ?? "",
        r.delivered_at ?? "",
        r.opened_at ?? "",
        r.acknowledged_at ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${drill ?? "feedback"}-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{meta?.title ?? "Feedback"}</SheetTitle>
          <SheetDescription>{meta?.description}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.length.toLocaleString()} record{rows.length === 1 ? "" : "s"}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={downloadCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
        <div className="mt-3 rounded-lg border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Created</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    No matching records.
                  </TableCell>
                </TableRow>
              ) : (
                rows.slice(0, 500).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {nameById.get(r.agent_id ?? "") ?? "Unassigned"}
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {(r.feedback_type ?? "—").replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {r.severity ? (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {r.severity}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {r.score != null ? Number(r.score).toFixed(2) : "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/feedback/$id"
                        params={{ id: r.id }}
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={onClose}
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {rows.length > 500 && (
          <div className="mt-2 text-center text-[11px] text-muted-foreground">
            Showing first 500 of {rows.length.toLocaleString()}. Export CSV for the full list.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
