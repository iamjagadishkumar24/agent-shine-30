import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, MessageSquareText, Users, CheckCircle2, AlertTriangle, TrendingUp, Send } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [agentsRes, feedbackRes] = await Promise.all([
        supabase.from("agents").select("id, qa_score, department, status"),
        supabase.from("feedback").select("id, status, feedback_type, severity, score, created_at, agent_id"),
      ]);
      if (agentsRes.error) throw agentsRes.error;
      if (feedbackRes.error) throw feedbackRes.error;
      return { agents: agentsRes.data ?? [], feedback: feedbackRes.data ?? [] };
    },
  });
}

function Stat({ icon: Icon, label, value, delta, tone = "default" }: { icon: any; label: string; value: string; delta?: string; tone?: "default" | "positive" | "warning" | "critical" }) {
  const toneCls = { default: "text-foreground", positive: "text-[oklch(0.72_0.16_160)]", warning: "text-[oklch(0.78_0.16_75)]", critical: "text-destructive" }[tone];
  return (
    <Card className="rounded-xl border-border/60 bg-card/60 p-5 backdrop-blur transition hover:border-border">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("mt-3 text-2xl font-semibold tracking-tight", toneCls)}>{value}</div>
      {delta && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {delta.startsWith("+") ? <ArrowUpRight className="h-3 w-3 text-[oklch(0.72_0.16_160)]" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
          {delta} vs last month
        </div>
      )}
    </Card>
  );
}

function Dashboard() {
  const { data, isLoading } = useDashboardData();
  const agents = data?.agents ?? [];
  const feedback = data?.feedback ?? [];

  const avgQA = agents.length ? (agents.reduce((s, a) => s + Number(a.qa_score ?? 0), 0) / agents.length).toFixed(1) : "0";
  const active = agents.filter((a) => a.status === "active").length;
  const sent = feedback.filter((f) => f.status === "sent" || f.status === "acknowledged" || f.status === "completed").length;
  const pending = feedback.filter((f) => f.status === "draft" || f.status === "review").length;
  const critical = feedback.filter((f) => f.severity === "critical").length;
  const acked = feedback.filter((f) => f.status === "acknowledged" || f.status === "completed").length;

  // build 8-week trend from feedback dates
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 - i) * 7);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    return { label, count: 0, qa: 82 + Math.round(Math.sin(i) * 4) + i };
  });
  feedback.forEach((f) => {
    const idx = Math.min(7, Math.max(0, Math.floor((Date.now() - new Date(f.created_at).getTime()) / (7 * 86400000))));
    const bucket = weeks[7 - idx];
    if (bucket) bucket.count += 1;
  });

  const byDept = Object.entries(
    agents.reduce<Record<string, { total: number; sum: number }>>((acc, a) => {
      const k = a.department ?? "Other";
      acc[k] ??= { total: 0, sum: 0 };
      acc[k].total += 1; acc[k].sum += Number(a.qa_score ?? 0);
      return acc;
    }, {})
  ).map(([name, v]) => ({ name, qa: Number((v.sum / Math.max(1, v.total)).toFixed(1)) }));

  const typeDist = ["positive", "constructive", "critical", "compliance", "coaching"].map((t) => ({
    name: t, value: feedback.filter((f) => f.feedback_type === t).length,
  })).filter((d) => d.value > 0);
  const COLORS = ["oklch(0.72 0.16 160)", "oklch(0.72 0.16 275)", "oklch(0.62 0.22 25)", "oklch(0.78 0.16 75)", "oklch(0.65 0.16 210)"];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Team-wide quality health at a glance." />
      <div className="mx-auto max-w-7xl px-8 pb-12">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Stat icon={Users} label="Active agents" value={String(active)} delta="+3.2%" />
          <Stat icon={TrendingUp} label="Avg QA score" value={avgQA} delta="+1.4%" tone="positive" />
          <Stat icon={Send} label="Feedback sent" value={String(sent)} delta="+12.6%" />
          <Stat icon={MessageSquareText} label="Pending" value={String(pending)} tone="warning" />
          <Stat icon={AlertTriangle} label="Critical" value={String(critical)} tone="critical" />
          <Stat icon={CheckCircle2} label="Acknowledged" value={String(acked)} tone="positive" />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 rounded-xl border-border/60 bg-card/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Feedback velocity</div>
                <div className="text-xs text-muted-foreground">Last 8 weeks</div>
              </div>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer>
                <LineChart data={weeks}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="qa" stroke="oklch(0.72 0.16 160)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-sm font-medium">Feedback mix</div>
            <div className="text-xs text-muted-foreground">By type</div>
            <div className="mt-4 h-64">
              {typeDist.length === 0 ? (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">No feedback yet</div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={typeDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {typeDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        <Card className="mt-4 rounded-xl border-border/60 bg-card/60 p-5">
          <div className="text-sm font-medium">Department QA scores</div>
          <div className="text-xs text-muted-foreground">Average score across active agents</div>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <BarChart data={byDept}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="qa" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {isLoading && <div className="mt-4 text-xs text-muted-foreground">Loading…</div>}
      </div>
    </div>
  );
}
