import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Send,
  Sparkles,
  Clock,
  GraduationCap,
  Mail,
  CheckCircle2,
  FileEdit,
  CalendarCheck,
  ShieldAlert,
  RefreshCw,
  Info,
  ListChecks,
  Star,
  FileText,
  Zap,
  Plus,
  CalendarPlus,
  Activity,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format, isAfter, subDays } from "date-fns";
import { ChartSkeleton, KpiCardSkeleton, ListRowSkeleton } from "@/components/ui/skeleton-blocks";

// Lazy-loaded heavy chart components — split into an async chunk so the
// dashboard shell (KPIs + lists) renders immediately with skeletons.
const HeavyCharts = {
  Trend: lazy(() => import("@/components/dashboard/heavy-charts").then((m) => ({ default: m.TrendChartCard }))),
  Category: lazy(() => import("@/components/dashboard/heavy-charts").then((m) => ({ default: m.CategoryDonutCard }))),
  Gauge: lazy(() => import("@/components/dashboard/heavy-charts").then((m) => ({ default: m.QaGaugeCard }))),
  Email: lazy(() => import("@/components/dashboard/heavy-charts").then((m) => ({ default: m.EmailDonutCard }))),
  Heatmap: lazy(() => import("@/components/dashboard/heavy-charts").then((m) => ({ default: m.ActivityHeatmapCard }))),
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});


// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------
function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [agentsRes, feedbackRes, coachingRes, itemsRes] = await Promise.all([
        supabase.from("agents").select("id, full_name, employee_id, department, avatar_url, qa_score, status"),
        supabase
          .from("feedback")
          .select("id, status, feedback_type, severity, score, created_at, agent_id, title, delivered_at, opened_at, clicked_at, acknowledged_at, escalated_at, email_error")
          .order("created_at", { ascending: false }),
        supabase
          .from("coaching_sessions")
          .select("id, agent_id, topic, status, scheduled_at, created_at, agent:agents(full_name, department)")
          .order("scheduled_at", { ascending: false })
          .limit(200),
        supabase.from("coaching_action_items").select("id, status, due_date"),
      ]);
      if (agentsRes.error) throw agentsRes.error;
      if (feedbackRes.error) throw feedbackRes.error;
      if (coachingRes.error) throw coachingRes.error;
      if (itemsRes.error) throw itemsRes.error;
      const agents = (agentsRes.data ?? []).map((a) => ({ ...a, name: a.full_name }));
      return {
        agents,
        feedback: feedbackRes.data ?? [],
        coaching: coachingRes.data ?? [],
        items: itemsRes.data ?? [],
      };
    },
  });
}

// ---------------------------------------------------------------------------
// SPARKLINE
// ---------------------------------------------------------------------------
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const series = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer>
        <LineChart data={series} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI CARD
// ---------------------------------------------------------------------------
type Tone = "violet" | "emerald" | "amber" | "rose" | "sky" | "fuchsia" | "teal" | "indigo";
const TONE: Record<Tone, { grad: string; ring: string; hex: string }> = {
  violet:  { grad: "from-[oklch(0.65_0.20_285)] to-[oklch(0.55_0.22_290)]", ring: "ring-[oklch(0.65_0.20_285)]/30", hex: "oklch(0.65 0.20 285)" },
  emerald: { grad: "from-[oklch(0.72_0.16_160)] to-[oklch(0.60_0.15_170)]", ring: "ring-[oklch(0.72_0.16_160)]/30", hex: "oklch(0.72 0.16 160)" },
  amber:   { grad: "from-[oklch(0.80_0.16_75)] to-[oklch(0.68_0.17_50)]",   ring: "ring-[oklch(0.80_0.16_75)]/30",  hex: "oklch(0.80 0.16 75)" },
  rose:    { grad: "from-[oklch(0.66_0.22_20)] to-[oklch(0.58_0.24_15)]",   ring: "ring-[oklch(0.66_0.22_20)]/30",  hex: "oklch(0.66 0.22 20)" },
  sky:     { grad: "from-[oklch(0.70_0.14_235)] to-[oklch(0.58_0.17_260)]", ring: "ring-[oklch(0.70_0.14_235)]/30", hex: "oklch(0.70 0.14 235)" },
  fuchsia: { grad: "from-[oklch(0.68_0.24_330)] to-[oklch(0.58_0.24_310)]", ring: "ring-[oklch(0.68_0.24_330)]/30", hex: "oklch(0.68 0.24 330)" },
  teal:    { grad: "from-[oklch(0.72_0.13_195)] to-[oklch(0.58_0.14_210)]", ring: "ring-[oklch(0.72_0.13_195)]/30", hex: "oklch(0.72 0.13 195)" },
  indigo:  { grad: "from-[oklch(0.60_0.20_265)] to-[oklch(0.48_0.22_275)]", ring: "ring-[oklch(0.60_0.20_265)]/30", hex: "oklch(0.60 0.20 265)" },
};

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
  sparkline,
  drillTo,
  drillSearch,
  tooltip,
}: {
  label: string;
  value: string;
  delta?: { pct: string; positive: boolean; suffix?: string };
  icon: any;
  tone: Tone;
  sparkline?: number[];
  drillTo?: string;
  drillSearch?: Record<string, unknown>;
  tooltip?: string;
}) {
  const t = TONE[tone];
  const inner = (
    <Card className="group relative h-full overflow-hidden rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-lg hover:shadow-black/5">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-30"
        style={{ background: `radial-gradient(circle, ${t.hex}, transparent 70%)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="truncate">{label}</span>
            {tooltip && (
              <TooltipProvider delayDuration={100}>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 shrink-0 opacity-60 transition hover:opacity-100" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    {tooltip}
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="mt-2.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
        </div>
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br ring-1", t.grad, t.ring)}>
          <Icon className="h-4.5 w-4.5 text-white" />
        </div>
      </div>
      {sparkline && sparkline.some((v) => v > 0) && (
        <div className="-mx-1 mt-3 opacity-80 transition group-hover:opacity-100">
          <Sparkline data={sparkline} color={t.hex} />
        </div>
      )}
      {delta && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {delta.positive ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-[oklch(0.72_0.16_160)]" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className={cn("font-medium tabular-nums", delta.positive ? "text-[oklch(0.72_0.16_160)]" : "text-destructive")}>
            {delta.pct}
          </span>
          <span className="text-muted-foreground">{delta.suffix ?? "vs prev period"}</span>
        </div>
      )}
      {drillTo && (
        <div className="absolute right-3 top-3 opacity-0 transition group-hover:opacity-100">
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </Card>
  );
  return drillTo ? (
    <Link to={drillTo as any} search={drillSearch as any} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function pctChange(curr: number, prev: number): { pct: string; positive: boolean } {
  if (prev === 0 && curr === 0) return { pct: "0.0%", positive: true };
  if (prev === 0) return { pct: "100%", positive: true };
  const change = ((curr - prev) / prev) * 100;
  return { pct: `${Math.abs(change).toFixed(1)}%`, positive: change >= 0 };
}

function bucketByWeek<T extends { created_at: string }>(rows: T[], filter: (r: T) => boolean, weeks = 12) {
  const out = new Array(weeks).fill(0);
  for (const r of rows) {
    if (!filter(r)) continue;
    const w = Math.floor((Date.now() - new Date(r.created_at).getTime()) / (7 * 86400000));
    if (w >= 0 && w < weeks) out[weeks - 1 - w] += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const [range, setRange] = useState<"Daily" | "Weekly" | "Monthly">("Weekly");

  const agents = data?.agents ?? [];
  const feedback = data?.feedback ?? [];
  const coaching = data?.coaching ?? [];
  const items = data?.items ?? [];

  // Base KPIs
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === "active").length;
  const totalFeedback = feedback.length;
  const sent = feedback.filter((f) => ["sent", "acknowledged", "completed"].includes(f.status as string)).length;
  const pending = feedback.filter((f) => ["draft", "review"].includes(f.status as string)).length;
  const completed = feedback.filter((f) => f.status === "completed" || f.status === "acknowledged").length;
  const highPriority = feedback.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const coachingCount = coaching.length;
  const openTasks = items.filter((i) => i.status === "open" || i.status === "in_progress").length;
  const closedTasks = items.filter((i) => i.status === "done").length;
  const avgQA = agents.length ? agents.reduce((s, a) => s + Number(a.qa_score ?? 0), 0) / agents.length : 0;
  const scoredFb = feedback.filter((f) => f.score != null);
  const avgCSAT = scoredFb.length ? scoredFb.reduce((s, f) => s + Number(f.score ?? 0), 0) / scoredFb.length : 0;
  const qualityScore = Math.min(100, avgQA * 0.6 + (completed / Math.max(1, totalFeedback)) * 40);

  // Sparklines (12 weeks)
  const sparkAll = useMemo(() => bucketByWeek(feedback, () => true), [feedback]);
  const sparkSent = useMemo(() => bucketByWeek(feedback, (f) => ["sent", "acknowledged", "completed"].includes(f.status as string)), [feedback]);
  const sparkPending = useMemo(() => bucketByWeek(feedback, (f) => ["draft", "review"].includes(f.status as string)), [feedback]);
  const sparkCompleted = useMemo(() => bucketByWeek(feedback, (f) => f.status === "completed" || f.status === "acknowledged"), [feedback]);
  const sparkHigh = useMemo(() => bucketByWeek(feedback, (f) => f.severity === "critical" || f.severity === "high"), [feedback]);
  const sparkCoaching = useMemo(() => bucketByWeek(coaching as any, () => true), [coaching]);

  // Weekly/monthly trend deltas
  const weekAgo = subDays(new Date(), 7);
  const twoWeeksAgo = subDays(new Date(), 14);
  const monthAgo = subDays(new Date(), 30);
  const twoMonthsAgo = subDays(new Date(), 60);
  const fbLastWeek = feedback.filter((f) => isAfter(new Date(f.created_at), weekAgo)).length;
  const fbPrevWeek = feedback.filter((f) => {
    const d = new Date(f.created_at);
    return isAfter(d, twoWeeksAgo) && !isAfter(d, weekAgo);
  }).length;
  const fbLastMonth = feedback.filter((f) => isAfter(new Date(f.created_at), monthAgo)).length;
  const fbPrevMonth = feedback.filter((f) => {
    const d = new Date(f.created_at);
    return isAfter(d, twoMonthsAgo) && !isAfter(d, monthAgo);
  }).length;
  const weekDelta = pctChange(fbLastWeek, fbPrevWeek);
  const monthDelta = pctChange(fbLastMonth, fbPrevMonth);

  // Trend chart data based on range
  const trendData = useMemo(() => {
    if (range === "Daily") {
      return Array.from({ length: 14 }, (_, i) => {
        const day = subDays(new Date(), 13 - i);
        const bucket = feedback.filter((f) => {
          const d = new Date(f.created_at);
          return d.toDateString() === day.toDateString();
        });
        return {
          label: format(day, "MMM d"),
          sent: bucket.filter((f) => ["sent", "acknowledged", "completed"].includes(f.status as string)).length,
          received: bucket.filter((f) => ["acknowledged", "completed"].includes(f.status as string)).length,
        };
      });
    }
    if (range === "Monthly") {
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        d.setDate(1);
        const next = new Date(d);
        next.setMonth(next.getMonth() + 1);
        const bucket = feedback.filter((f) => {
          const fd = new Date(f.created_at);
          return fd >= d && fd < next;
        });
        return {
          label: format(d, "MMM yy"),
          sent: bucket.filter((f) => ["sent", "acknowledged", "completed"].includes(f.status as string)).length,
          received: bucket.filter((f) => ["acknowledged", "completed"].includes(f.status as string)).length,
        };
      });
    }
    // Weekly (8 weeks)
    return Array.from({ length: 8 }, (_, i) => {
      const start = subDays(new Date(), (7 - i) * 7 + 6);
      const end = subDays(new Date(), (7 - i) * 7 - 1);
      const bucket = feedback.filter((f) => {
        const d = new Date(f.created_at);
        return d >= start && d <= end;
      });
      return {
        label: format(start, "MMM d"),
        sent: bucket.filter((f) => ["sent", "acknowledged", "completed"].includes(f.status as string)).length,
        received: bucket.filter((f) => ["acknowledged", "completed"].includes(f.status as string)).length,
      };
    });
  }, [range, feedback]);

  // Category donut
  const catColors = [
    "oklch(0.65 0.20 285)",
    "oklch(0.72 0.16 160)",
    "oklch(0.70 0.14 235)",
    "oklch(0.80 0.16 75)",
    "oklch(0.68 0.24 330)",
    "oklch(0.66 0.22 20)",
  ];
  const categoriesRaw: Record<string, string> = {
    constructive: "Communication",
    positive: "Customer Focus",
    compliance: "Process Adherence",
    coaching: "Knowledge",
    critical: "Behavior",
  };
  const catMap: Record<string, number> = {};
  feedback.forEach((f) => {
    const k = categoriesRaw[(f.feedback_type as string) ?? ""] ?? "Others";
    catMap[k] = (catMap[k] ?? 0) + 1;
  });
  const totalCat = Object.values(catMap).reduce((a, b) => a + b, 0) || 1;
  const categories = Object.entries(catMap).map(([name, value], i) => ({
    name,
    value,
    pct: (value / totalCat) * 100,
    color: catColors[i % catColors.length],
  }));

  // Status rows
  const statusCounts = {
    draft: feedback.filter((f) => f.status === "draft").length,
    review: feedback.filter((f) => f.status === "review").length,
    sent: feedback.filter((f) => f.status === "sent").length,
    acknowledged: feedback.filter((f) => f.status === "acknowledged" || f.status === "completed").length,
  };
  const statusTotal = Math.max(1, Object.values(statusCounts).reduce((a, b) => a + b, 0));
  const statusRows: Array<{ key: string; value: number; color: string; filter: string }> = [
    { key: "Draft", value: statusCounts.draft, color: "oklch(0.65 0.20 285)", filter: "draft" },
    { key: "Pending", value: statusCounts.review, color: "oklch(0.80 0.16 75)", filter: "review" },
    { key: "Sent", value: statusCounts.sent, color: "oklch(0.70 0.14 235)", filter: "sent" },
    { key: "Acknowledged", value: statusCounts.acknowledged, color: "oklch(0.72 0.16 160)", filter: "acknowledged" },
  ];

  // Email
  const emailStats = {
    delivered: feedback.filter((f) => f.delivered_at).length,
    opened: feedback.filter((f) => f.opened_at).length,
    clicked: feedback.filter((f) => f.clicked_at).length,
    failed: feedback.filter((f) => f.email_error).length,
  };
  const totalEmails = emailStats.delivered || 1;
  const emailSlices = [
    { name: "Delivered", value: emailStats.delivered, color: "oklch(0.72 0.16 160)" },
    { name: "Opened", value: emailStats.opened, color: "oklch(0.65 0.20 285)" },
    { name: "Clicked", value: emailStats.clicked, color: "oklch(0.70 0.14 235)" },
    { name: "Failed", value: emailStats.failed, color: "oklch(0.66 0.22 20)" },
  ];

  // Activity heatmap — 7 days × 24 hours based on created_at
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    feedback.forEach((f) => {
      const d = new Date(f.created_at);
      if (Date.now() - d.getTime() > 30 * 86400000) return;
      grid[d.getDay()][d.getHours()] += 1;
    });
    return grid;
  }, [feedback]);
  const heatMax = Math.max(1, ...heatmap.flat());

  // Recent activity
  const activity = feedback.slice(0, 5).map((f) => {
    const a = agents.find((x) => x.id === f.agent_id);
    return {
      id: f.id,
      title:
        f.status === "acknowledged" || f.status === "completed"
          ? "Feedback acknowledged"
          : f.status === "sent"
          ? "Feedback sent to"
          : f.status === "draft"
          ? "New feedback draft"
          : f.severity === "critical" || f.severity === "high"
          ? "High priority feedback"
          : "Feedback update",
      who: a?.name ?? "Unknown",
      when: f.created_at,
      severity: f.severity,
      status: f.status,
    };
  });

  const topAgents = [...agents]
    .sort((a, b) => Number(b.qa_score ?? 0) - Number(a.qa_score ?? 0))
    .slice(0, 5);

  const latestFeedback = feedback.slice(0, 5);
  const upcomingCoaching = coaching
    .filter((c: any) => c.status === "scheduled" && c.scheduled_at && new Date(c.scheduled_at) > new Date())
    .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 4);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    refetch();
  };

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-8 py-5">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              Executive Overview <span className="text-lg">👋</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Live snapshot of quality operations across your organization.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/feedback/new">
              <Button size="sm" className="h-8 gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New feedback
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={refresh}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-8 pb-16 pt-6 [&_>_*]:animate-in [&_>_*]:fade-in [&_>_*]:duration-300">
        {/* KPI GRID */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {isLoading && !data && Array.from({ length: 12 }).map((_, i) => <KpiCardSkeleton key={i} />)}
          {(!isLoading || data) && (<>

          <KpiCard label="Total Feedback" value={totalFeedback.toLocaleString()} icon={Mail} tone="violet"
            delta={monthDelta} sparkline={sparkAll} drillTo="/feedback"
            tooltip="All feedback records regardless of status." />
          <KpiCard label="Pending Reviews" value={pending.toLocaleString()} icon={Clock} tone="amber"
            sparkline={sparkPending} drillTo="/feedback" drillSearch={{ status: "pending" }}
            tooltip="Drafts and items awaiting review." />
          <KpiCard label="Completed" value={completed.toLocaleString()} icon={CheckCircle2} tone="emerald"
            sparkline={sparkCompleted} drillTo="/feedback" drillSearch={{ status: "completed" }}
            tooltip="Feedback acknowledged or completed." />
          <KpiCard label="Active Agents" value={`${activeAgents}/${totalAgents}`} icon={Users} tone="sky"
            drillTo="/agents"
            tooltip="Agents currently active in the roster." />
          <KpiCard label="Coaching Sessions" value={coachingCount.toLocaleString()} icon={GraduationCap} tone="fuchsia"
            sparkline={sparkCoaching} drillTo="/coaching"
            tooltip="1:1 coaching sessions scheduled or completed." />
          <KpiCard label="Quality Score" value={`${qualityScore.toFixed(1)}%`} icon={Sparkles} tone="teal"
            tooltip="Blended score of QA average and completion rate." />

          <KpiCard label="Average CSAT" value={avgCSAT.toFixed(1)} icon={Star} tone="amber"
            tooltip="Average customer satisfaction score across evaluated feedback." />
          <KpiCard label="Average QA Score" value={`${avgQA.toFixed(1)}%`} icon={Activity} tone="indigo"
            drillTo="/agents"
            tooltip="Average QA score across all agents." />
          <KpiCard label="High Priority" value={highPriority.toLocaleString()} icon={ShieldAlert} tone="rose"
            drillTo="/feedback" drillSearch={{ status: "high_priority" }}
            tooltip="Feedback marked high or critical severity." />
          <KpiCard label="Open Tasks" value={openTasks.toLocaleString()} icon={ListChecks} tone="rose"
            drillTo="/coaching"
            tooltip="Coaching action items open or in progress." />
          <KpiCard label="Closed Tasks" value={closedTasks.toLocaleString()} icon={CheckCircle2} tone="emerald"
            drillTo="/coaching"
            tooltip="Completed coaching action items." />
          <KpiCard label="Weekly Trend" value={fbLastWeek.toLocaleString()} icon={Zap} tone="violet"
            delta={{ ...weekDelta, suffix: "vs prev week" }} sparkline={sparkAll.slice(-6)}
            drillTo="/feedback" drillSearch={{ range: "7d" }}
            tooltip="Feedback created in the last 7 days." />
          </>)}
        </div>


        {/* MIDDLE — Trend, Category, QA, Status, Email, Heatmap (charts lazy-loaded) */}
        <div className="mt-5 grid grid-cols-12 gap-5">
          <Suspense fallback={<div className="col-span-12 xl:col-span-8"><ChartSkeleton /></div>}>
            <HeavyCharts.Trend data={trendData} range={range} onRangeChange={setRange} />
          </Suspense>

          <Suspense fallback={<div className="col-span-12 md:col-span-6 xl:col-span-4"><ChartSkeleton height="h-44" /></div>}>
            <HeavyCharts.Category categories={categories} totalCat={totalCat} onSliceClick={(name) => navigate({ to: "/feedback", search: { category: name } })} />
          </Suspense>

          <Suspense fallback={<div className="col-span-12 md:col-span-6 xl:col-span-4"><ChartSkeleton height="h-52" /></div>}>
            <HeavyCharts.Gauge avgQA={avgQA} />
          </Suspense>

          {/* Status (light, kept inline) */}
          <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl md:col-span-6 xl:col-span-4">
            <div className="text-sm font-semibold">Feedback Status</div>
            <div className="mt-5 space-y-4">
              {statusRows.map((r) => {
                const pct = (r.value / statusTotal) * 100;
                return (
                  <div key={r.key}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                        <span className="text-muted-foreground">{r.key}</span>
                      </div>
                      <div className="tabular-nums">
                        <span className="font-medium">{r.value}</span>
                        <span className="ml-1.5 text-muted-foreground">({pct.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: r.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Suspense fallback={<div className="col-span-12 md:col-span-6 xl:col-span-4"><ChartSkeleton height="h-40" /></div>}>
            <HeavyCharts.Email emailStats={emailStats} emailSlices={emailSlices} totalEmails={totalEmails} />
          </Suspense>

          <Suspense fallback={<div className="col-span-12"><ChartSkeleton height="h-48" /></div>}>
            <HeavyCharts.Heatmap heatmap={heatmap} heatMax={heatMax} />
          </Suspense>
        </div>


        {/* BOTTOM ROW — Latest Feedback, Upcoming Coaching, Quick Actions, Recent Activity, Top Agents */}
        <div className="mt-5 grid grid-cols-12 gap-5">
          {/* Latest Feedback */}
          <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl xl:col-span-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Latest Feedback</div>
              <Link to="/feedback" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {latestFeedback.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">No feedback yet.</div>
              )}
              {latestFeedback.map((f) => {
                const a = agents.find((x) => x.id === f.agent_id);
                const sev = f.severity as string;
                const sevColor =
                  sev === "critical" || sev === "high"
                    ? "bg-[oklch(0.66_0.22_20)]/15 text-[oklch(0.66_0.22_20)]"
                    : sev === "medium"
                    ? "bg-[oklch(0.80_0.16_75)]/15 text-[oklch(0.80_0.16_75)]"
                    : "bg-muted text-muted-foreground";
                return (
                  <Link
                    key={f.id}
                    to="/feedback/$id"
                    params={{ id: f.id }}
                    className="-mx-2 flex items-start gap-3 rounded-lg p-2 transition hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{f.title ?? "Untitled feedback"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{a?.name ?? "Unknown agent"}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide", sevColor)}>
                        {sev}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          {/* Upcoming Coaching */}
          <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl md:col-span-6 xl:col-span-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Upcoming Coaching</div>
              <Link to="/coaching" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {upcomingCoaching.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">No upcoming sessions.</div>
              )}
              {upcomingCoaching.map((c: any) => (
                <Link
                  key={c.id}
                  to="/coaching/$id"
                  params={{ id: c.id }}
                  className="-mx-2 flex items-start gap-3 rounded-lg p-2 transition hover:bg-muted/40"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[oklch(0.68_0.24_330)]/15 text-[oklch(0.68_0.24_330)]">
                    <CalendarPlus className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{c.topic ?? "Coaching session"}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {c.agent?.full_name ?? "Agent"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                    {format(new Date(c.scheduled_at), "MMM d")}
                    <div>{format(new Date(c.scheduled_at), "p")}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl md:col-span-6 xl:col-span-4">
            <div className="text-sm font-semibold">Quick Actions</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                { to: "/feedback/new", label: "New Feedback", icon: Plus, tone: "violet" as Tone },
                { to: "/coaching/new", label: "Schedule Coaching", icon: CalendarPlus, tone: "fuchsia" as Tone },
                { to: "/agents", label: "View Agents", icon: Users, tone: "sky" as Tone },
                { to: "/reports", label: "Run Reports", icon: FileText, tone: "emerald" as Tone },
                { to: "/analytics", label: "Analytics", icon: Activity, tone: "indigo" as Tone },
                { to: "/settings", label: "Settings", icon: Sparkles, tone: "amber" as Tone },
              ].map((q) => {
                const t = TONE[q.tone];
                return (
                  <Link
                    key={q.to}
                    to={q.to as any}
                    className="group flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-3 transition hover:-translate-y-0.5 hover:border-border hover:bg-muted/40"
                  >
                    <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-linear-to-br", t.grad)}>
                      <q.icon className="h-4 w-4 text-white" />
                    </div>
                    <span className="min-w-0 truncate text-xs font-medium">{q.label}</span>
                  </Link>
                );
              })}
            </div>
          </Card>

          {/* Recent Activity */}
          <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl md:col-span-6 xl:col-span-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Recent Activity</div>
              <Link to="/feedback" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {activity.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">No recent activity yet.</div>
              )}
              {activity.map((a) => {
                const iconMap = {
                  "Feedback sent to": Send,
                  "New feedback draft": FileEdit,
                  "Coaching session scheduled": CalendarCheck,
                  "Feedback acknowledged": CheckCircle2,
                  "High priority feedback": ShieldAlert,
                  "Feedback update": Mail,
                } as Record<string, any>;
                const Icon = iconMap[a.title] ?? Mail;
                const toneMap: Record<string, string> = {
                  "Feedback sent to": "bg-[oklch(0.65_0.20_285)]/15 text-[oklch(0.65_0.20_285)]",
                  "New feedback draft": "bg-[oklch(0.70_0.14_235)]/15 text-[oklch(0.70_0.14_235)]",
                  "Coaching session scheduled": "bg-[oklch(0.80_0.16_75)]/15 text-[oklch(0.80_0.16_75)]",
                  "Feedback acknowledged": "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
                  "High priority feedback": "bg-[oklch(0.66_0.22_20)]/15 text-[oklch(0.66_0.22_20)]",
                  "Feedback update": "bg-muted text-muted-foreground",
                };
                return (
                  <Link
                    key={a.id}
                    to="/feedback/$id"
                    params={{ id: a.id }}
                    className="-mx-2 flex items-start gap-3 rounded-lg p-2 transition hover:bg-muted/40"
                  >
                    <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", toneMap[a.title] ?? "bg-muted")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{a.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{a.who}</div>
                    </div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(a.when), { addSuffix: false })}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          {/* Top Agents */}
          <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl md:col-span-6 xl:col-span-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Top Agents</div>
              <Link to="/agents" className="text-xs text-primary hover:underline">View all</Link>
            </div>
            <div className="mt-4 space-y-2">
              {topAgents.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">No agents yet.</div>
              )}
              {topAgents.map((a, i) => (
                <div key={a.id} className="-mx-2 flex items-center gap-3 rounded-lg p-2 transition hover:bg-muted/40">
                  <span className="w-4 text-center text-xs font-medium tabular-nums text-muted-foreground">{i + 1}</span>
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-[oklch(0.65_0.20_285)] to-[oklch(0.55_0.22_290)] text-xs font-medium text-white">
                    {a.name?.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{a.name}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{a.department}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-muted-foreground">QA Score</div>
                    <div className="text-xs font-medium tabular-nums">{Number(a.qa_score ?? 0).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        
      </div>
    </div>
  );
}
