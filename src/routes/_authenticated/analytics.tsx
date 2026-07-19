import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, TrendingUp, TrendingDown, Users, Target, AlertCircle, Mail, ArrowRight } from "lucide-react";

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

function useAnalyticsData() {
  return useQuery({
    queryKey: ["analytics", "core"],
    queryFn: async () => {
      const [fbRes, agRes] = await Promise.all([
        supabase
          .from("feedback")
          .select("id, status, feedback_type, severity, score, created_at, agent_id, delivered_at, opened_at, acknowledged_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("agents").select("id, full_name, qa_score").limit(2000),
      ]);
      if (fbRes.error) throw fbRes.error;
      if (agRes.error) throw agRes.error;
      return {
        feedback: (fbRes.data ?? []) as unknown as FeedbackRow[],
        agents: (agRes.data ?? []) as unknown as AgentRow[],
      };
    },
    staleTime: 30_000,
  });
}

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useAnalyticsData();
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

    // trailing 30d vs prior 30d
    const now = Date.now();
    const d30 = now - 30 * 864e5;
    const d60 = now - 60 * 864e5;
    const last30 = feedback.filter((f) => {
      const t = parseTime(f.created_at);
      return t != null && t >= d30;
    }).length;
    const prev30 = feedback.filter((f) => {
      const t = parseTime(f.created_at);
      return t != null && t >= d60 && t < d30;
    }).length;
    const delta = prev30 === 0 ? (last30 ? 100 : 0) : Math.round(((last30 - prev30) / prev30) * 100);

    return { total, sent, delivered, opened, acknowledged, avgScore, last30, delta };
  }, [feedback]);

  const monthly = useMemo(() => {
    const buckets = new Map<string, { label: string; count: number; scoreSum: number; scoreN: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, {
        label: d.toLocaleDateString(undefined, { month: "short" }),
        count: 0,
        scoreSum: 0,
        scoreN: 0,
      });
    }
    for (const f of feedback) {
      const t = parseTime(f.created_at);
      if (t == null) continue;
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  }, [feedback]);

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
    return order
      .map((k) => ({ label: k, value: m.get(k) ?? 0 }))
      .filter((x) => x.value > 0);
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

  if (isError) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Deep trends across feedback, delivery, and agent performance." />
        <div className="mx-auto max-w-4xl px-8 pb-12 pt-6">
          <Card className="rounded-xl border-destructive/50 bg-destructive/5 p-8 text-center">
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

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Deep trends across feedback, delivery, and agent performance." />
        <div className="mx-auto max-w-7xl space-y-4 px-8 pb-12 pt-6">
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!feedback.length) {
    return (
      <div>
        <PageHeader title="Analytics" subtitle="Deep trends across feedback, delivery, and agent performance." />
        <div className="mx-auto max-w-4xl px-8 pb-12 pt-6">
          <Card className="rounded-xl border-border/60 bg-card/60 p-10 text-center">
            <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-medium">No feedback data yet</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Create feedback records to unlock trend, distribution, and leaderboard analytics.
            </p>
            <Link to="/feedback/new" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
              Create feedback →
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Deep trends across feedback, delivery, and agent performance." />
      <div className="mx-auto max-w-7xl space-y-4 px-8 pb-12 pt-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Total feedback"
            value={metrics.total.toLocaleString()}
            hint={`${metrics.last30.toLocaleString()} in last 30d`}
            delta={metrics.delta}
            icon={<BarChart3 className="h-4 w-4" />}
          />
          <KpiCard
            label="Avg Quality score"
            value={metrics.avgScore ? metrics.avgScore.toFixed(2) : "—"}
            hint={`${feedback.filter((f) => f.score != null).length.toLocaleString()} scored`}
            icon={<Target className="h-4 w-4" />}
          />
          <KpiCard
            label="Delivery rate"
            value={`${pct(metrics.delivered, metrics.sent)}%`}
            hint={`${metrics.delivered.toLocaleString()} / ${metrics.sent.toLocaleString()} sent`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <KpiCard
            label="Acknowledgement rate"
            value={`${pct(metrics.acknowledged, metrics.delivered)}%`}
            hint={`${metrics.acknowledged.toLocaleString()} acknowledged`}
            icon={<Users className="h-4 w-4" />}
          />
        </div>

        <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
          <Charts monthly={monthly} byType={byType} bySeverity={bySeverity} />
        </Suspense>

        <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Top agents by feedback volume</div>
              <div className="text-xs text-muted-foreground">Highest engagement over the entire history.</div>
            </div>
            <Link to="/agents" className="text-xs font-medium text-primary hover:underline">
              View all →
            </Link>
          </div>
          {topAgents.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No assigned feedback yet.</div>
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
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  delta,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  icon?: React.ReactNode;
}) {
  const trendPositive = (delta ?? 0) >= 0;
  return (
    <Card className="rounded-xl border-border/60 bg-card/60 p-4 backdrop-blur-xl">
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
      </div>
    </Card>
  );
}
