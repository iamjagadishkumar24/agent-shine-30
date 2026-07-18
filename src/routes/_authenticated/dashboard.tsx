import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Send,
  Sparkles,
  Clock,
  AlertTriangle,
  GraduationCap,
  Mail,
  CheckCircle2,
  FileEdit,
  CalendarCheck,
  ShieldAlert,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [agentsRes, feedbackRes] = await Promise.all([
        supabase.from("agents").select("id, name, employee_id, department, avatar_url, qa_score, status"),
        supabase
          .from("feedback")
          .select("id, status, feedback_type, severity, score, created_at, agent_id, subject, delivered_at, opened_at, clicked_at, acknowledged_at, escalated_at")
          .order("created_at", { ascending: false }),
      ]);
      if (agentsRes.error) throw agentsRes.error;
      if (feedbackRes.error) throw feedbackRes.error;
      return { agents: agentsRes.data ?? [], feedback: feedbackRes.data ?? [] };
    },
  });
}

// ---------------------------------------------------------------------------
// KPI CARD
// ---------------------------------------------------------------------------
type Tone = "violet" | "emerald" | "amber" | "rose" | "sky" | "fuchsia";
const TONE: Record<Tone, { bg: string; ring: string; icon: string; glow: string }> = {
  violet:  { bg: "from-[oklch(0.65_0.20_285)] to-[oklch(0.55_0.22_290)]", ring: "ring-[oklch(0.65_0.20_285)]/30", icon: "text-white", glow: "shadow-[0_0_40px_-8px_oklch(0.65_0.20_285/0.55)]" },
  emerald: { bg: "from-[oklch(0.72_0.16_160)] to-[oklch(0.60_0.15_170)]", ring: "ring-[oklch(0.72_0.16_160)]/30", icon: "text-white", glow: "shadow-[0_0_40px_-8px_oklch(0.72_0.16_160/0.5)]" },
  amber:   { bg: "from-[oklch(0.80_0.16_75)] to-[oklch(0.68_0.17_50)]",   ring: "ring-[oklch(0.80_0.16_75)]/30",  icon: "text-white", glow: "shadow-[0_0_40px_-8px_oklch(0.80_0.16_75/0.5)]" },
  rose:    { bg: "from-[oklch(0.66_0.22_20)] to-[oklch(0.58_0.24_15)]",   ring: "ring-[oklch(0.66_0.22_20)]/30",  icon: "text-white", glow: "shadow-[0_0_40px_-8px_oklch(0.66_0.22_20/0.5)]" },
  sky:     { bg: "from-[oklch(0.70_0.14_235)] to-[oklch(0.58_0.17_260)]", ring: "ring-[oklch(0.70_0.14_235)]/30", icon: "text-white", glow: "shadow-[0_0_40px_-8px_oklch(0.70_0.14_235/0.5)]" },
  fuchsia: { bg: "from-[oklch(0.68_0.24_330)] to-[oklch(0.58_0.24_310)]", ring: "ring-[oklch(0.68_0.24_330)]/30", icon: "text-white", glow: "shadow-[0_0_40px_-8px_oklch(0.68_0.24_330/0.5)]" },
};

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  delta?: { pct: string; positive: boolean; suffix?: string };
  icon: any;
  tone: Tone;
}) {
  const t = TONE[tone];
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl transition hover:border-border">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-linear-to-br opacity-20 blur-2xl transition group-hover:opacity-30" style={{ background: `radial-gradient(circle, var(--primary), transparent 70%)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        </div>
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br ring-1", t.bg, t.ring, t.glow)}>
          <Icon className={cn("h-5 w-5", t.icon)} />
        </div>
      </div>
      {delta && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {delta.positive ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-[oklch(0.72_0.16_160)]" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className={cn("font-medium tabular-nums", delta.positive ? "text-[oklch(0.72_0.16_160)]" : "text-destructive")}>{delta.pct}</span>
          <span className="text-muted-foreground">{delta.suffix ?? "vs last month"}</span>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
function Dashboard() {
  const { data, isLoading } = useDashboardData();
  const agents = data?.agents ?? [];
  const feedback = data?.feedback ?? [];

  // KPI math
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === "active").length;
  const sent = feedback.filter((f) => ["sent", "acknowledged", "completed"].includes(f.status as string)).length;
  const pending = feedback.filter((f) => ["draft", "review"].includes(f.status as string)).length;
  const highPriority = feedback.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const avgQA = agents.length ? agents.reduce((s, a) => s + Number(a.qa_score ?? 0), 0) / agents.length : 0;
  const coachingSessions = feedback.filter((f) => f.feedback_type === "coaching").length;

  // Trend: 8 weeks — sent vs received (acknowledged)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i) * 7);
    return {
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      sent: 0,
      received: 0,
    };
  });
  feedback.forEach((f) => {
    const weeksAgo = Math.floor((Date.now() - new Date(f.created_at).getTime()) / (7 * 86400000));
    const bucket = weeks[7 - Math.min(7, Math.max(0, weeksAgo))];
    if (!bucket) return;
    if (["sent", "acknowledged", "completed"].includes(f.status as string)) bucket.sent += 1;
    if (["acknowledged", "completed"].includes(f.status as string)) bucket.received += 1;
  });

  // Category donut — feedback_type
  const catColors = [
    "oklch(0.65 0.20 285)", // violet
    "oklch(0.72 0.16 160)", // emerald
    "oklch(0.70 0.14 235)", // sky
    "oklch(0.80 0.16 75)",  // amber
    "oklch(0.68 0.24 330)", // fuchsia
    "oklch(0.66 0.22 20)",  // rose
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

  // Feedback status bars
  const statusCounts = {
    draft: feedback.filter((f) => f.status === "draft").length,
    review: feedback.filter((f) => f.status === "review").length,
    sent: feedback.filter((f) => f.status === "sent").length,
    acknowledged: feedback.filter((f) => f.status === "acknowledged" || f.status === "completed").length,
  };
  const statusTotal = Math.max(1, Object.values(statusCounts).reduce((a, b) => a + b, 0));
  const statusRows = [
    { key: "Draft", value: statusCounts.draft, color: "oklch(0.65 0.20 285)" },
    { key: "Pending", value: statusCounts.review, color: "oklch(0.80 0.16 75)" },
    { key: "Sent", value: statusCounts.sent, color: "oklch(0.70 0.14 235)" },
    { key: "Acknowledged", value: statusCounts.acknowledged, color: "oklch(0.72 0.16 160)" },
  ];

  // Email funnel donut
  const emailStats = {
    delivered: feedback.filter((f) => f.delivered_at).length,
    opened: feedback.filter((f) => f.opened_at).length,
    clicked: feedback.filter((f) => f.clicked_at).length,
    failed: feedback.filter((f) => (f as any).last_email_error).length,
  };
  const totalEmails = emailStats.delivered || 1;
  const emailSlices = [
    { name: "Delivered", value: emailStats.delivered, color: "oklch(0.72 0.16 160)" },
    { name: "Opened", value: emailStats.opened, color: "oklch(0.65 0.20 285)" },
    { name: "Clicked", value: emailStats.clicked, color: "oklch(0.70 0.14 235)" },
    { name: "Failed", value: emailStats.failed, color: "oklch(0.66 0.22 20)" },
  ];

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

  return (
    <div>
      {/* Custom header */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-8 py-5">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              Welcome back, Admin <span className="text-lg">👋</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Here's what's happening with your team today.</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-8 pb-16 pt-6">
        <div className="grid grid-cols-12 gap-5">
          {/* MAIN COLUMN */}
          <div className="col-span-12 space-y-5 xl:col-span-9">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Total Agents" value={totalAgents.toLocaleString()} icon={Users} tone="violet" delta={{ pct: "12.5%", positive: true }} />
              <KpiCard label="Feedback Sent" value={sent.toLocaleString()} icon={Send} tone="emerald" delta={{ pct: "18.2%", positive: true }} />
              <KpiCard label="QA Score (Avg)" value={`${avgQA.toFixed(1)}%`} icon={Sparkles} tone="fuchsia" delta={{ pct: "6.3%", positive: true }} />
              <KpiCard label="Pending Feedback" value={pending.toLocaleString()} icon={Clock} tone="amber" delta={{ pct: "8.7%", positive: false }} />
              <KpiCard label="High Priority" value={highPriority.toLocaleString()} icon={AlertTriangle} tone="rose" delta={{ pct: "3.2%", positive: false }} />
              <KpiCard label="Coaching Sessions" value={coachingSessions.toLocaleString()} icon={GraduationCap} tone="sky" delta={{ pct: "15.8%", positive: true }} />
            </div>

            {/* Trend + Category */}
            <div className="grid gap-5 lg:grid-cols-5">
              <Card className="lg:col-span-3 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Feedback Trend</div>
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-[oklch(0.65_0.20_285)]" /> Feedback Sent
                      </span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-[oklch(0.70_0.14_235)]" /> Feedback Received
                      </span>
                    </div>
                  </div>
                  <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs">
                    {["Daily", "Weekly", "Monthly"].map((p) => (
                      <button
                        key={p}
                        className={cn(
                          "rounded-md px-3 py-1 font-medium transition",
                          p === "Weekly" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-6 h-72">
                  <ResponsiveContainer>
                    <AreaChart data={weeks} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="grad-sent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="grad-rcv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.70 0.14 235)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="oklch(0.70 0.14 235)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
                      <Area type="monotone" dataKey="sent" stroke="oklch(0.65 0.20 285)" strokeWidth={2.5} fill="url(#grad-sent)" dot={{ r: 3, fill: "oklch(0.65 0.20 285)", strokeWidth: 0 }} />
                      <Area type="monotone" dataKey="received" stroke="oklch(0.70 0.14 235)" strokeWidth={2.5} fill="url(#grad-rcv)" dot={{ r: 3, fill: "oklch(0.70 0.14 235)", strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="lg:col-span-2 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
                <div className="text-sm font-semibold">Feedback by Category</div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="relative h-44 w-44 shrink-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={categories.length ? categories : [{ name: "None", value: 1, color: "oklch(0.26 0.010 265)" }]}
                          dataKey="value"
                          innerRadius={55}
                          outerRadius={82}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {(categories.length ? categories : [{ color: "oklch(0.26 0.010 265)" }]).map((c: any, i) => (
                            <Cell key={i} fill={c.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <div className="text-2xl font-semibold tabular-nums">{totalCat}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    {(categories.length ? categories : [{ name: "No data yet", pct: 0, color: "oklch(0.26 0.010 265)" }]).map((c: any) => (
                      <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className="truncate text-muted-foreground">{c.name}</span>
                        </div>
                        <span className="tabular-nums text-foreground">{c.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* QA gauge + Status + Email */}
            <div className="grid gap-5 lg:grid-cols-3">
              {/* QA Score radial gauge */}
              <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
                <div className="text-sm font-semibold">QA Score Trend</div>
                <div className="relative mt-4 h-52">
                  <ResponsiveContainer>
                    <RadialBarChart
                      innerRadius="70%"
                      outerRadius="100%"
                      data={[{ name: "qa", value: avgQA, fill: "url(#gauge-grad)" }]}
                      startAngle={180}
                      endAngle={0}
                    >
                      <defs>
                        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="oklch(0.66 0.22 20)" />
                          <stop offset="50%" stopColor="oklch(0.68 0.24 330)" />
                          <stop offset="100%" stopColor="oklch(0.72 0.16 160)" />
                        </linearGradient>
                      </defs>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar background={{ fill: "var(--muted)" }} dataKey="value" cornerRadius={10} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-x-0 bottom-6 grid place-items-center">
                    <div className="text-3xl font-semibold tabular-nums">{avgQA.toFixed(1)}%</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Average QA Score</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>0%</span>
                  <span className="flex items-center gap-1 text-[oklch(0.72_0.16_160)]">
                    <ArrowUpRight className="h-3 w-3" /> 6.3% vs last month
                  </span>
                  <span>100%</span>
                </div>
              </Card>

              {/* Feedback Status */}
              <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
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
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: r.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Email Status */}
              <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
                <div className="text-sm font-semibold">Email Status</div>
                <div className="mt-3 flex items-center gap-4">
                  <div className="relative h-40 w-40 shrink-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={emailSlices.every((s) => s.value === 0) ? [{ value: 1, color: "var(--muted)" }] : emailSlices}
                          dataKey="value"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {(emailSlices.every((s) => s.value === 0) ? [{ color: "var(--muted)" }] : emailSlices).map((s: any, i) => (
                            <Cell key={i} fill={s.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <div className="text-xl font-semibold tabular-nums">{emailStats.delivered}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Emails</div>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2 text-xs">
                    {emailSlices.map((s) => (
                      <div key={s.name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                          <span className="text-muted-foreground">{s.name}</span>
                        </div>
                        <span className="tabular-nums">
                          {s.value}{" "}
                          <span className="text-muted-foreground">({((s.value / totalEmails) * 100).toFixed(1)}%)</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* RIGHT RAIL */}
          <div className="col-span-12 space-y-5 xl:col-span-3">
            <Card className="rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Recent Activity</div>
                <Link to="/feedback" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="mt-4 space-y-3">
                {activity.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No recent activity yet.</div>}
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
                    <Link key={a.id} to="/feedback/$id" params={{ id: a.id }} className="flex items-start gap-3 rounded-lg p-2 -mx-2 transition hover:bg-muted/40">
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

            <Card className="rounded-2xl border-border/60 bg-card/60 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Top Agents</div>
                <Link to="/agents" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="mt-4 space-y-2">
                {topAgents.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No agents yet.</div>}
                {topAgents.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg p-2 -mx-2 transition hover:bg-muted/40">
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

        {isLoading && <div className="mt-4 text-xs text-muted-foreground">Loading…</div>}
      </div>
    </div>
  );
}
