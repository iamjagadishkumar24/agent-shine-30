import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAgentReport } from "@/lib/agent-reports.functions";
import { ArrowLeft, FileText, FileSpreadsheet } from "lucide-react";
import { toCsv, toPdf } from "@/lib/reports";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/agent-reports/$id")({
  component: AgentReportDetail,
});

type Period = "all" | "current_week" | "previous_week" | "current_month" | "previous_month" | "custom";

function periodRange(p: Period, customFrom?: string, customTo?: string): { from?: string; to?: string; label: string } {
  const now = new Date();
  switch (p) {
    case "current_week": {
      const from = startOfWeek(now, { weekStartsOn: 1 }); const to = endOfWeek(now, { weekStartsOn: 1 });
      return { from: from.toISOString(), to: to.toISOString(), label: `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}` };
    }
    case "previous_week": {
      const w = subWeeks(now, 1);
      const from = startOfWeek(w, { weekStartsOn: 1 }); const to = endOfWeek(w, { weekStartsOn: 1 });
      return { from: from.toISOString(), to: to.toISOString(), label: `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}` };
    }
    case "current_month": {
      const from = startOfMonth(now); const to = endOfMonth(now);
      return { from: from.toISOString(), to: to.toISOString(), label: format(from, "MMMM yyyy") };
    }
    case "previous_month": {
      const m = subMonths(now, 1);
      const from = startOfMonth(m); const to = endOfMonth(m);
      return { from: from.toISOString(), to: to.toISOString(), label: format(from, "MMMM yyyy") };
    }
    case "custom":
      return {
        from: customFrom ? new Date(customFrom).toISOString() : undefined,
        to: customTo ? new Date(customTo + "T23:59:59").toISOString() : undefined,
        label: customFrom && customTo ? `${format(new Date(customFrom), "d MMM yyyy")} – ${format(new Date(customTo), "d MMM yyyy")}` : "Custom",
      };
    default:
      return { label: "All time" };
  }
}

function AgentReportDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAgentReport);
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = periodRange(period, from, to);

  const { data, isLoading } = useQuery({
    queryKey: ["agent-report", id, period, from, to],
    queryFn: () => fn({ data: { agentId: id, from: range.from, to: range.to } }),
  });

  const agent = data?.agent;
  const feedback = (data?.feedback ?? []) as any[];
  const paramScores = (data?.paramScores ?? []) as any[];

  const stats = useMemo(() => {
    const scores = feedback.map((f) => f.score).filter((s) => typeof s === "number");
    const ackd = feedback.filter((f) => f.acknowledgement_status === "acknowledged" || f.acknowledged_at).length;
    const pending = feedback.filter((f) => f.sent_at && !f.acknowledged_at && f.acknowledgement_status !== "acknowledged").length;
    const chat = feedback.filter((f) => f.interaction_type === "chat").length;
    const cases = feedback.filter((f) => f.interaction_type === "case").length;
    return {
      total: feedback.length,
      avg: scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : null,
      high: scores.length ? Math.max(...scores) : null,
      low: scores.length ? Math.min(...scores) : null,
      ackd, pending, chat, cases,
      first: feedback.length ? feedback[feedback.length - 1].created_at : null,
      last: feedback.length ? feedback[0].created_at : null,
    };
  }, [feedback]);

  const trendData = useMemo(() =>
    [...feedback].reverse().map((f) => ({
      date: format(new Date(f.created_at), "MMM d"),
      score: f.score ?? 0,
    })), [feedback]);

  const paramAvg = useMemo(() => {
    const acc = new Map<string, { earned: number; max: number; count: number }>();
    for (const p of paramScores) {
      const cur = acc.get(p.parameter_name) ?? { earned: 0, max: 0, count: 0 };
      cur.earned += Number(p.earned_points) || 0;
      cur.max += Number(p.max_points) || 0;
      cur.count += 1;
      acc.set(p.parameter_name, cur);
    }
    return Array.from(acc.entries()).map(([name, v]) => ({
      name,
      avg: v.count ? Math.round((v.earned / v.count) * 10) / 10 : 0,
      max: v.count ? Math.round((v.max / v.count) * 10) / 10 : 0,
    }));
  }, [paramScores]);

  const interactionPie = [
    { name: "Chat", value: stats.chat, fill: "#4F46E5" },
    { name: "Case", value: stats.cases, fill: "#0EA5E9" },
  ];

  const exportPdf = () => {
    if (!agent) return;
    toPdf({
      title: `Agent Report — ${agent.full_name}`,
      subtitle: `Period: ${range.label} • Generated ${format(new Date(), "PPpp")}`,
      filename: `agent-report-${agent.full_name.replace(/\s+/g, "-")}.pdf`,
      sections: [
        {
          title: "Summary",
          columns: ["Metric", "Value"],
          rows: [
            ["Total feedback", stats.total],
            ["Average score", stats.avg ?? "—"],
            ["Highest score", stats.high ?? "—"],
            ["Lowest score", stats.low ?? "—"],
            ["Acknowledged", stats.ackd],
            ["Pending", stats.pending],
            ["Chat / Case", `${stats.chat} / ${stats.cases}`],
          ],
        },
        paramAvg.length ? {
          title: "Parameter averages",
          columns: ["Parameter", "Average", "Max"],
          rows: paramAvg.map((p) => [p.name, p.avg, p.max]),
        } : null,
        {
          title: "Feedback history",
          columns: ["Case", "Title", "Type", "Score", "Ack", "Date"],
          rows: feedback.map((f) => [
            f.case_number ?? "—",
            f.title ?? "",
            f.interaction_type ?? "",
            f.score ?? "—",
            f.acknowledgement_status ?? "—",
            f.created_at ? format(new Date(f.created_at), "yyyy-MM-dd") : "",
          ]),
        },
      ].filter(Boolean) as any,
    });
  };

  const exportCsv = () => {
    if (!agent) return;
    toCsv(feedback.map((f) => ({
      Case: f.case_number ?? "",
      Title: f.title,
      Type: f.interaction_type,
      Score: f.score ?? "",
      Status: f.status,
      Acknowledgement: f.acknowledgement_status ?? "",
      Date: f.created_at ? format(new Date(f.created_at), "yyyy-MM-dd") : "",
    })), `agent-${agent.full_name.replace(/\s+/g, "-")}.csv`);
  };

  return (
    <div>
      <PageHeader
        title={agent ? agent.full_name : "Agent Report"}
        subtitle={agent ? `${agent.email ?? ""} • Reporting Period: ${range.label}` : "Loading…"}
        actions={
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/agent-reports"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}><FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
            <Button size="sm" onClick={exportPdf}><FileText className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
          </div>
        }
      />
      <div className="mx-auto max-w-7xl space-y-5 px-4 pb-16 pt-4 sm:px-8">
        {/* Period picker */}
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="current_week">Current week</SelectItem>
                  <SelectItem value="previous_week">Previous week</SelectItem>
                  <SelectItem value="current_month">Current month</SelectItem>
                  <SelectItem value="previous_month">Previous month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {period === "custom" && (
              <>
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[160px]" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-[160px]" />
                </div>
                {from && to && new Date(to) < new Date(from) && (
                  <div className="text-xs text-destructive">End date must be after start date</div>
                )}
              </>
            )}
          </div>
        </Card>

        {isLoading ? (
          <Card className="p-10 text-center text-muted-foreground">Loading agent report…</Card>
        ) : !agent ? (
          <Card className="p-10 text-center text-muted-foreground">Agent not found.</Card>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: "Total feedback", value: stats.total },
                { label: "Average score", value: stats.avg ?? "—", accent: "text-primary" },
                { label: "Highest", value: stats.high ?? "—", accent: "text-emerald-600" },
                { label: "Lowest", value: stats.low ?? "—", accent: "text-amber-600" },
                { label: "Acknowledged", value: stats.ackd },
                { label: "Pending", value: stats.pending, accent: stats.pending > 0 ? "text-amber-600" : "" },
                { label: "Chat", value: stats.chat },
                { label: "Case", value: stats.cases },
              ].map((c, i) => (
                <Card key={i} className="p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
                  <div className={`mt-1 text-2xl font-semibold tabular-nums ${c.accent ?? ""}`}>{c.value}</div>
                </Card>
              ))}
            </div>

            {/* Charts */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-5">
                <div className="mb-3 text-sm font-semibold">Score trend</div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Line type="monotone" dataKey="score" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <div className="mb-3 text-sm font-semibold">Parameter averages</div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={paramAvg}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} height={60} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Bar dataKey="avg" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <div className="mb-3 text-sm font-semibold">Interaction mix</div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={interactionPie} dataKey="value" innerRadius={50} outerRadius={90} label>
                        {interactionPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Legend />
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <div className="mb-3 text-sm font-semibold">Acknowledgement completion</div>
                <div className="flex h-64 flex-col justify-center gap-2 px-4">
                  <div className="flex items-center justify-between text-sm">
                    <span>Acknowledged</span>
                    <span className="font-semibold">{stats.ackd} / {stats.total}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${stats.total ? (stats.ackd / stats.total) * 100 : 0}%` }} />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span>Pending</span>
                    <span className="font-semibold text-amber-600">{stats.pending}</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Feedback list */}
            <Card className="overflow-hidden">
              <div className="border-b px-5 py-3 text-sm font-semibold">Feedback history ({feedback.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Case</th>
                      <th className="px-4 py-2 text-left">Title</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-right">Score</th>
                      <th className="px-4 py-2 text-left">Ack</th>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {feedback.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No feedback in this period.</td></tr>
                    )}
                    {feedback.map((f) => (
                      <tr key={f.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 font-mono text-xs">{f.case_number ?? "—"}</td>
                        <td className="px-4 py-2 max-w-xs truncate">{f.title}</td>
                        <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">{f.interaction_type}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{f.score ?? "—"}</td>
                        <td className="px-4 py-2"><Badge variant="outline">{f.acknowledgement_status ?? "—"}</Badge></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{format(new Date(f.created_at), "d MMM yyyy")}</td>
                        <td className="px-4 py-2 text-right">
                          <Link to="/feedback/$id" params={{ id: f.id }} className="text-xs text-primary hover:underline">View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
