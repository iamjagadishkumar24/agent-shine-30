import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAgentReport, listAgentReportFeedback, listAgentFeedbackEmails } from "@/lib/agent-reports.functions";
import { ArrowLeft, FileText, FileSpreadsheet, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
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

type SortBy = "created_at" | "sent_at" | "score" | "case_number" | "title";
type EmailSortBy = "created_at" | "sent_at" | "delivered_at" | "status";

function AgentReportDetail() {
  const { id } = Route.useParams();
  const summaryFn = useServerFn(getAgentReport);
  const listFn = useServerFn(listAgentReportFeedback);
  const emailFn = useServerFn(listAgentFeedbackEmails);

  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = periodRange(period, from, to);

  // feedback table state
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [ackStatus, setAckStatus] = useState<string>("all");
  const [interaction, setInteraction] = useState<string>("all");
  const [minScore, setMinScore] = useState<string>("");
  const [maxScore, setMaxScore] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // email table state
  const [emailSearch, setEmailSearch] = useState("");
  const [emailStatus, setEmailStatus] = useState<string>("all");
  const [emailSortBy, setEmailSortBy] = useState<EmailSortBy>("created_at");
  const [emailSortDir, setEmailSortDir] = useState<"asc" | "desc">("desc");
  const [emailPage, setEmailPage] = useState(1);

  const summary = useQuery({
    queryKey: ["agent-report-summary", id, range.from, range.to],
    queryFn: () => summaryFn({ data: { agentId: id, from: range.from, to: range.to } }),
  });

  const feedbackQ = useQuery({
    queryKey: ["agent-report-feedback", id, range.from, range.to, search, status, ackStatus, interaction, minScore, maxScore, sortBy, sortDir, page],
    queryFn: () => listFn({
      data: {
        agentId: id,
        from: range.from,
        to: range.to,
        search: search || undefined,
        status: status !== "all" ? status : undefined,
        ackStatus: ackStatus !== "all" ? ackStatus : undefined,
        interactionType: interaction !== "all" ? (interaction as "chat" | "case") : undefined,
        minScore: minScore ? Number(minScore) : undefined,
        maxScore: maxScore ? Number(maxScore) : undefined,
        sortBy, sortDir, page, pageSize,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const emailQ = useQuery({
    queryKey: ["agent-report-emails", id, range.from, range.to, emailSearch, emailStatus, emailSortBy, emailSortDir, emailPage],
    queryFn: () => emailFn({
      data: {
        agentId: id,
        from: range.from,
        to: range.to,
        search: emailSearch || undefined,
        status: emailStatus !== "all" ? emailStatus : undefined,
        sortBy: emailSortBy, sortDir: emailSortDir, page: emailPage, pageSize,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const agent = summary.data?.agent as any;
  const stats = summary.data?.stats ?? { total: 0, avg: null, high: null, low: null, ackd: 0, pending: 0, chat: 0, cases: 0 } as any;
  const paramAvg = (summary.data?.paramAvg ?? []) as Array<{ name: string; avg: number; max: number }>;
  const trendData = useMemo(() =>
    (summary.data?.trend ?? []).map((t: any) => ({ date: format(new Date(t.date), "MMM d"), score: t.score })),
    [summary.data]);

  const feedbackRows = (feedbackQ.data?.rows ?? []) as any[];
  const totalRows = feedbackQ.data?.total ?? 0;
  const totalPages = feedbackQ.data?.totalPages ?? 1;

  const emailRows = (emailQ.data?.rows ?? []) as any[];
  const emailTotal = emailQ.data?.total ?? 0;
  const emailTotalPages = emailQ.data?.totalPages ?? 1;

  const interactionPie = [
    { name: "Chat", value: stats.chat, fill: "#4F46E5" },
    { name: "Case", value: stats.cases, fill: "#0EA5E9" },
  ];

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
    setPage(1);
  };
  const toggleEmailSort = (col: EmailSortBy) => {
    if (emailSortBy === col) setEmailSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setEmailSortBy(col); setEmailSortDir("desc"); }
    setEmailPage(1);
  };

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
          title: `Feedback (page ${page}/${totalPages})`,
          columns: ["Case", "Title", "Type", "Score", "Ack", "Date"],
          rows: feedbackRows.map((f) => [
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
    toCsv(feedbackRows.map((f) => ({
      Case: f.case_number ?? "",
      Title: f.title,
      Type: f.interaction_type,
      Score: f.score ?? "",
      Status: f.status,
      Acknowledgement: f.acknowledgement_status ?? "",
      Date: f.created_at ? format(new Date(f.created_at), "yyyy-MM-dd") : "",
    })), `agent-${agent.full_name.replace(/\s+/g, "-")}.csv`);
  };

  const SortHeader = ({ label, col, align = "left" }: { label: string; col: SortBy; align?: "left" | "right" }) => (
    <th className={`px-4 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(col)}>
        {label} <ArrowUpDown className={`h-3 w-3 ${sortBy === col ? "text-primary" : "opacity-50"}`} />
      </button>
    </th>
  );
  const EmailSortHeader = ({ label, col }: { label: string; col: EmailSortBy }) => (
    <th className="px-4 py-2 text-left">
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleEmailSort(col)}>
        {label} <ArrowUpDown className={`h-3 w-3 ${emailSortBy === col ? "text-primary" : "opacity-50"}`} />
      </button>
    </th>
  );

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
              <Select value={period} onValueChange={(v) => { setPeriod(v as Period); setPage(1); setEmailPage(1); }}>
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
                  <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-[160px]" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-[160px]" />
                </div>
                {from && to && new Date(to) < new Date(from) && (
                  <div className="text-xs text-destructive">End date must be after start date</div>
                )}
              </>
            )}
          </div>
        </Card>

        {summary.isLoading ? (
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

            {/* Feedback table with server-side filters */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-end gap-3 border-b p-4">
                <div className="text-sm font-semibold mr-auto">Feedback history ({totalRows})</div>
                <Input placeholder="Search title / case / category" value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 w-64" />
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="ready_to_send">Ready to send</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={ackStatus} onValueChange={(v) => { setAckStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Ack status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ack</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="response_received">Response received</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={interaction} onValueChange={(v) => { setInteraction(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="case">Case</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Min score" value={minScore}
                  onChange={(e) => { setMinScore(e.target.value); setPage(1); }} className="h-9 w-[100px]" />
                <Input type="number" placeholder="Max score" value={maxScore}
                  onChange={(e) => { setMaxScore(e.target.value); setPage(1); }} className="h-9 w-[100px]" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <SortHeader label="Case" col="case_number" />
                      <SortHeader label="Title" col="title" />
                      <th className="px-4 py-2 text-left">Type</th>
                      <SortHeader label="Score" col="score" align="right" />
                      <th className="px-4 py-2 text-left">Ack</th>
                      <SortHeader label="Sent" col="sent_at" />
                      <SortHeader label="Created" col="created_at" />
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {feedbackQ.isFetching && feedbackRows.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
                    )}
                    {!feedbackQ.isFetching && feedbackRows.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No feedback matches these filters.</td></tr>
                    )}
                    {feedbackRows.map((f) => (
                      <tr key={f.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 font-mono text-xs">{f.case_number ?? "—"}</td>
                        <td className="px-4 py-2 max-w-xs truncate">{f.title}</td>
                        <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">{f.interaction_type}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{f.score ?? "—"}</td>
                        <td className="px-4 py-2"><Badge variant="outline">{f.acknowledgement_status ?? "—"}</Badge></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{f.sent_at ? format(new Date(f.sent_at), "d MMM yyyy") : "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{format(new Date(f.created_at), "d MMM yyyy")}</td>
                        <td className="px-4 py-2 text-right">
                          <Link to="/feedback/$id" params={{ id: f.id }} className="text-xs text-primary hover:underline">View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
                <div>Page {page} of {totalPages} • {totalRows} rows</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Email delivery history */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-end gap-3 border-b p-4">
                <div className="text-sm font-semibold mr-auto">Email delivery history ({emailTotal})</div>
                <Input placeholder="Search subject / recipient" value={emailSearch}
                  onChange={(e) => { setEmailSearch(e.target.value); setEmailPage(1); }} className="h-9 w-64" />
                <Select value={emailStatus} onValueChange={(v) => { setEmailStatus(v); setEmailPage(1); }}>
                  <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="sending">Sending</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="bounced">Bounced</SelectItem>
                    <SelectItem value="deferred">Deferred</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">Subject</th>
                      <th className="px-4 py-2 text-left">Recipient</th>
                      <EmailSortHeader label="Status" col="status" />
                      <th className="px-4 py-2 text-left">Provider</th>
                      <th className="px-4 py-2 text-left">Attempts</th>
                      <EmailSortHeader label="Sent" col="sent_at" />
                      <EmailSortHeader label="Delivered" col="delivered_at" />
                      <EmailSortHeader label="Created" col="created_at" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {emailQ.isFetching && emailRows.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</td></tr>
                    )}
                    {!emailQ.isFetching && emailRows.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No emails match.</td></tr>
                    )}
                    {emailRows.map((e) => (
                      <tr key={e.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 max-w-xs truncate">{e.subject}</td>
                        <td className="px-4 py-2 text-xs">{e.to_email}</td>
                        <td className="px-4 py-2"><Badge variant="outline">{e.status}</Badge></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{e.provider ?? "—"}</td>
                        <td className="px-4 py-2 text-xs tabular-nums">{e.attempts}/{e.max_attempts}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{e.sent_at ? format(new Date(e.sent_at), "d MMM HH:mm") : "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{e.delivered_at ? format(new Date(e.delivered_at), "d MMM HH:mm") : "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{format(new Date(e.created_at), "d MMM HH:mm")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
                <div>Page {emailPage} of {emailTotalPages} • {emailTotal} rows</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={emailPage <= 1} onClick={() => setEmailPage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Button>
                  <Button size="sm" variant="outline" disabled={emailPage >= emailTotalPages} onClick={() => setEmailPage((p) => Math.min(emailTotalPages, p + 1))}>
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
