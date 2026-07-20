import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import {
  Mail, MailCheck, MailOpen, MousePointerClick, AlertTriangle, Ban,
  Search, ArrowLeft, RefreshCw, Download,
} from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTableShell, DataTableHeader, DataTableRow, DataTableCell,
  SortableTh, useTableSort, sortRows,
  TableEmpty, TablePagination, usePagination, paginate,
} from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics/email")({
  component: EmailAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Email Analytics · QualiPulse" },
      { name: "description", content: "Historical email delivery metrics, engagement trends, and full activity log." },
    ],
  }),
});

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
} as const;

const PROVIDER_COLORS: Record<string, string> = {
  gmail: "#ea4335",
  resend: "#0ea5e9",
  sendgrid: "#1a73e8",
  postmark: "#f59e0b",
  mailgun: "#c53030",
  smtp: "#8b5cf6",
  unknown: "#71717a",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  queued:     { label: "Queued",     cls: "bg-muted text-muted-foreground border-border" },
  processing: { label: "Sending",    cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  sent:       { label: "Accepted",   cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  delivered:  { label: "Delivered",  cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  opened:     { label: "Opened",     cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  clicked:    { label: "Clicked",    cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  bounced:    { label: "Bounced",    cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  complained: { label: "Complained", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  deferred:   { label: "Deferred",   cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  failed:     { label: "Failed",     cls: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
};

type QueueRow = {
  id: string;
  feedback_id: string | null;
  kind: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  status: string;
  provider: string | null;
  provider_status: string | null;
  provider_message_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  complained_at: string | null;
  deferred_until: string | null;
  last_event_at: string | null;
};

type EventRow = {
  id: string;
  provider: string;
  event_type: string | null;
  recipient: string | null;
  matched_queue_id: string | null;
  matched_feedback_id: string | null;
  created_at: string;
};

type FeedbackRow = {
  id: string;
  opened_at: string | null;
  clicked_at: string | null;
};

function useEmailAnalytics() {
  return useQuery({
    queryKey: ["email-analytics"],
    queryFn: async () => {
      const [queueRes, eventsRes, fbRes] = await Promise.all([
        supabase
          .from("email_queue")
          .select("id, feedback_id, kind, to_email, to_name, subject, status, provider, provider_status, provider_message_id, attempts, last_error, created_at, sent_at, delivered_at, bounced_at, bounce_reason, complained_at, deferred_until, last_event_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("email_webhook_events")
          .select("id, provider, event_type, recipient, matched_queue_id, matched_feedback_id, created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("feedback")
          .select("id, opened_at, clicked_at")
          .not("sent_at", "is", null)
          .limit(5000),
      ]);
      if (queueRes.error) throw queueRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (fbRes.error) throw fbRes.error;
      return {
        queue: (queueRes.data ?? []) as QueueRow[],
        events: (eventsRes.data ?? []) as EventRow[],
        feedback: (fbRes.data ?? []) as FeedbackRow[],
      };
    },
    staleTime: 15_000,
  });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function toCsv(rows: QueueRow[]): string {
  const headers = ["created_at", "to_email", "subject", "provider", "status", "provider_status", "attempts", "sent_at", "delivered_at", "bounced_at", "bounce_reason", "last_error"];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const body = rows.map((r) => headers.map((h) => escape((r as any)[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function EmailAnalyticsPage() {
  useRealtimeInvalidate("email_queue", [["email-analytics"]]);
  useRealtimeInvalidate("email_webhook_events", [["email-analytics"]]);

  const { data, isLoading, isFetching, refetch } = useEmailAnalytics();
  const queue = data?.queue ?? [];
  const events = data?.events ?? [];
  const feedback = data?.feedback ?? [];

  const [days, setDays] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const kpis = useMemo(() => {
    const total = queue.length;
    const sent = queue.filter((q) => q.sent_at).length;
    const delivered = queue.filter((q) => q.delivered_at || q.provider_status === "delivered").length;
    const opened = feedback.filter((f) => f.opened_at).length;
    const clicked = feedback.filter((f) => f.clicked_at).length;
    const bounced = queue.filter((q) => q.bounced_at).length;
    const failed = queue.filter((q) => q.status === "failed" || q.last_error).length;
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    return {
      total, sent, delivered, opened, clicked, bounced, failed,
      deliveredRate: pct(delivered, sent || total),
      openedRate: pct(opened, delivered || sent || 1),
      clickedRate: pct(clicked, opened || 1),
      bounceRate: pct(bounced, sent || total),
    };
  }, [queue, feedback]);

  const timeline = useMemo(() => {
    const buckets = new Map<string, { day: string; sent: number; delivered: number; opened: number; clicked: number; bounced: number; failed: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(subDays(new Date(), i));
      const key = format(d, "yyyy-MM-dd");
      buckets.set(key, { day: format(d, "MMM d"), sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 });
    }
    for (const q of queue) {
      const created = q.sent_at ?? q.created_at;
      const key = format(startOfDay(new Date(created)), "yyyy-MM-dd");
      const b = buckets.get(key);
      if (!b) continue;
      if (q.sent_at) b.sent++;
      if (q.delivered_at) b.delivered++;
      if (q.bounced_at) b.bounced++;
      if (q.status === "failed" || q.last_error) b.failed++;
    }
    for (const e of events) {
      const key = format(startOfDay(new Date(e.created_at)), "yyyy-MM-dd");
      const b = buckets.get(key);
      if (!b) continue;
      if (e.event_type === "opened" || e.event_type === "open") b.opened++;
      if (e.event_type === "clicked" || e.event_type === "click") b.clicked++;
    }
    return Array.from(buckets.values());
  }, [queue, events, days]);

  const providerBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of queue) {
      const p = (q.provider || "unknown").toLowerCase();
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [queue]);

  const eventBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      const k = (e.event_type || "unknown").toLowerCase();
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [events]);

  const providerOptions = useMemo(() => {
    const s = new Set<string>();
    queue.forEach((q) => q.provider && s.add(q.provider));
    return Array.from(s).sort();
  }, [queue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue.filter((row) => {
      if (provider !== "all" && (row.provider ?? "") !== provider) return false;
      if (statusFilter !== "all") {
        const effective = row.provider_status || row.status;
        if (effective !== statusFilter) return false;
      }
      if (q) {
        const hay = `${row.to_email} ${row.subject} ${row.provider ?? ""} ${row.status} ${row.provider_message_id ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [queue, search, provider, statusFilter]);

  type Sort = "created_at" | "to_email" | "subject" | "provider" | "status" | "attempts" | "sent_at";
  const { field, dir, onSort } = useTableSort<Sort>("created_at", "desc");
  const sorted = useMemo(() => sortRows(filtered, (r) => {
    switch (field) {
      case "created_at": return r.created_at ? new Date(r.created_at) : null;
      case "sent_at":    return r.sent_at ? new Date(r.sent_at) : null;
      case "to_email":   return r.to_email ?? "";
      case "subject":    return r.subject ?? "";
      case "provider":   return r.provider ?? "";
      case "status":     return r.provider_status || r.status;
      case "attempts":   return r.attempts ?? 0;
      default:           return null;
    }
  }, dir), [filtered, field, dir]);

  const { page, pageSize, setPage, setPageSize } = usePagination(sorted.length, 25);
  const paged = paginate(sorted, page, pageSize);

  const downloadCsv = () => {
    const blob = new Blob([toCsv(sorted)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-activity-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Email analytics"
        subtitle="Historical delivery, engagement, and full activity log"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
              <Link to="/analytics"><ArrowLeft className="h-3.5 w-3.5" /> Overview</Link>
            </Button>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={downloadCsv} disabled={!sorted.length}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-[1600px] px-6 pb-12 pt-4 space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard icon={Mail}          label="Sent"       value={kpis.sent}       hint={`of ${kpis.total} total`} tone="blue" />
          <KpiCard icon={MailCheck}     label="Delivered"  value={`${kpis.deliveredRate}%`} hint={`${kpis.delivered} messages`} tone="emerald" />
          <KpiCard icon={MailOpen}      label="Opened"     value={`${kpis.openedRate}%`} hint={`${kpis.opened} unique opens`} tone="violet" />
          <KpiCard icon={MousePointerClick} label="Clicked" value={`${kpis.clickedRate}%`} hint={`${kpis.clicked} of opened`} tone="fuchsia" />
          <KpiCard icon={Ban}           label="Bounced"    value={`${kpis.bounceRate}%`} hint={`${kpis.bounced} messages`} tone="rose" />
          <KpiCard icon={AlertTriangle} label="Failed"     value={kpis.failed}     hint={`${kpis.failed} unresolved`} tone="amber" />
        </div>

        {/* Timeline */}
        <Card className="p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <div>
              <div className="eyebrow">Delivery timeline</div>
              <div className="text-sm text-muted-foreground">Daily sends, delivered, opens, clicks and bounces</div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer>
              <AreaChart data={timeline} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSent" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDelivered" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOpened" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="sent" name="Sent" stroke="#0ea5e9" fill="url(#gSent)" strokeWidth={2} />
                <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#10b981" fill="url(#gDelivered)" strokeWidth={2} />
                <Area type="monotone" dataKey="opened" name="Opened" stroke="#8b5cf6" fill="url(#gOpened)" strokeWidth={2} />
                <Area type="monotone" dataKey="clicked" name="Clicked" stroke="#d946ef" fill="none" strokeWidth={2} />
                <Area type="monotone" dataKey="bounced" name="Bounced" stroke="#f43f5e" fill="none" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="eyebrow mb-2">Provider mix</div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={providerBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {providerBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={PROVIDER_COLORS[entry.name] ?? PROVIDER_COLORS.unknown} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-4">
            <div className="eyebrow mb-2">Webhook event types</div>
            <div className="h-[260px] w-full">
              <ResponsiveContainer>
                <BarChart data={eventBreakdown} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Activity table */}
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipient, subject, message ID…" className="h-8 pl-8" />
            </div>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providerOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto text-xs text-muted-foreground">{sorted.length.toLocaleString()} messages</div>
          </div>

          <DataTableShell className="rounded-none border-0">
            <DataTableHeader>
              <tr>
                <SortableTh field="created_at" active={field} dir={dir} onSort={onSort}>Created</SortableTh>
                <SortableTh field="to_email"   active={field} dir={dir} onSort={onSort}>Recipient</SortableTh>
                <SortableTh field="subject"    active={field} dir={dir} onSort={onSort}>Subject</SortableTh>
                <SortableTh field="provider"   active={field} dir={dir} onSort={onSort}>Provider</SortableTh>
                <SortableTh field="status"     active={field} dir={dir} onSort={onSort}>Status</SortableTh>
                <SortableTh field="attempts"   active={field} dir={dir} onSort={onSort}>Attempts</SortableTh>
                <SortableTh field="sent_at"    active={field} dir={dir} onSort={onSort}>Sent</SortableTh>
              </tr>
            </DataTableHeader>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border/40 last:border-0" aria-busy="true">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3.5"><div className="h-3 w-24 bg-muted/40 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))}
              {!isLoading && paged.map((r) => {
                const effective = (r.provider_status || r.status) as keyof typeof STATUS_META;
                const meta = STATUS_META[effective] ?? STATUS_META.queued;
                return (
                  <DataTableRow key={r.id}>
                    <DataTableCell className="text-muted-foreground whitespace-nowrap">{fmtDateTime(r.created_at)}</DataTableCell>
                    <DataTableCell>
                      <div className="font-medium">{r.to_name || r.to_email}</div>
                      {r.to_name && <div className="text-xs text-muted-foreground">{r.to_email}</div>}
                    </DataTableCell>
                    <DataTableCell>
                      {r.feedback_id ? (
                        <Link to="/feedback/$id" params={{ id: r.feedback_id }} className="hover:text-primary">
                          <span className="line-clamp-1">{r.subject}</span>
                        </Link>
                      ) : (
                        <span className="line-clamp-1">{r.subject}</span>
                      )}
                      {r.last_error && (
                        <div className="mt-0.5 text-xs text-rose-300/80 line-clamp-1" title={r.last_error}>{r.last_error}</div>
                      )}
                    </DataTableCell>
                    <DataTableCell className="capitalize text-muted-foreground">{r.provider ?? "—"}</DataTableCell>
                    <DataTableCell>
                      <Badge variant="outline" className={cn("text-xs", meta.cls)}>{meta.label}</Badge>
                    </DataTableCell>
                    <DataTableCell className="text-muted-foreground tabular-nums">{r.attempts}</DataTableCell>
                    <DataTableCell className="text-muted-foreground whitespace-nowrap">{fmtDateTime(r.sent_at)}</DataTableCell>
                  </DataTableRow>
                );
              })}
              {!isLoading && sorted.length === 0 && (
                <TableEmpty
                  colSpan={7}
                  icon={Mail}
                  title="No email activity matches these filters"
                  message="Widen the date range, clear filters, or send a message to see activity here."
                />
              )}
            </tbody>
          </DataTableShell>
          {sorted.length > 0 && (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={sorted.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
  tone: "blue" | "emerald" | "violet" | "fuchsia" | "rose" | "amber";
}) {
  const toneCls: Record<string, string> = {
    blue:    "bg-blue-500/10 text-blue-300 ring-blue-500/20",
    emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    violet:  "bg-violet-500/10 text-violet-300 ring-violet-500/20",
    fuchsia: "bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/20",
    rose:    "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    amber:   "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="field-label text-muted-foreground">{label}</div>
          <div className="mt-1 stat-value">{value}</div>
          {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={cn("grid h-9 w-9 place-items-center rounded-lg ring-1", toneCls[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
