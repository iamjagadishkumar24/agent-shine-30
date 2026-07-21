import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, FileSpreadsheet, Users, TrendingUp, Mail, CalendarClock } from "lucide-react";
import { toCsv, toPdf } from "@/lib/reports";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Period = "all" | "current_week" | "previous_week" | "current_month" | "previous_month" | "custom";

function periodRange(p: Period, from?: string, to?: string): { from?: Date; to?: Date; label: string } {
  const now = new Date();
  switch (p) {
    case "current_week": { const f = startOfWeek(now, { weekStartsOn: 1 }); const t = endOfWeek(now, { weekStartsOn: 1 }); return { from: f, to: t, label: `${format(f, "d MMM")} – ${format(t, "d MMM yyyy")}` }; }
    case "previous_week": { const w = subWeeks(now, 1); const f = startOfWeek(w, { weekStartsOn: 1 }); const t = endOfWeek(w, { weekStartsOn: 1 }); return { from: f, to: t, label: `${format(f, "d MMM")} – ${format(t, "d MMM yyyy")}` }; }
    case "current_month": { const f = startOfMonth(now); const t = endOfMonth(now); return { from: f, to: t, label: format(f, "MMMM yyyy") }; }
    case "previous_month": { const m = subMonths(now, 1); const f = startOfMonth(m); const t = endOfMonth(m); return { from: f, to: t, label: format(f, "MMMM yyyy") }; }
    case "custom": return { from: from ? new Date(from) : undefined, to: to ? new Date(to + "T23:59:59") : undefined, label: from && to ? `${format(new Date(from), "d MMM yyyy")} – ${format(new Date(to), "d MMM yyyy")}` : "Custom range" };
    default: return { label: "All time" };
  }
}

function safeDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function monthKey(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ReportsPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = periodRange(period, customFrom, customTo);

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["report-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents")
        .select("id, full_name, employee_id, department, team, qa_score, status");
      if (error) throw error;
      return data;
    },
  });

  const { data: allFeedback = [], isLoading: feedbackLoading } = useQuery({
    queryKey: ["report-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feedback")
        .select("id, title, feedback_type, severity, status, category, score, created_at, sent_at, acknowledged_at, agent:agents(full_name, department)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const feedback = useMemo(() => {
    if (!range.from && !range.to) return allFeedback as any[];
    return (allFeedback as any[]).filter((f) => {
      const d = new Date(f.created_at);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      return true;
    });
  }, [allFeedback, range.from, range.to]);

  const dataLoading = agentsLoading || feedbackLoading;

  // Agent performance rows
  const perfRows = () => {
    const feedbackByAgent = new Map<string, any[]>();
    for (const f of feedback as any[]) {
      const key = f.agent?.full_name ?? "—";
      if (!feedbackByAgent.has(key)) feedbackByAgent.set(key, []);
      feedbackByAgent.get(key)!.push(f);
    }
    return (agents as any[]).map((a) => {
      const fs = feedbackByAgent.get(a.full_name) ?? [];
      const scores = fs.map((f) => f.score).filter((s) => typeof s === "number");
      const avg = scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
      return {
        Agent: a.full_name,
        Employee: a.employee_id ?? "",
        Department: a.department ?? "",
        Team: a.team ?? "",
        Status: a.status ?? "",
        "Quality Score": a.qa_score ?? "",
        "Feedback Count": fs.length,
        "Avg Feedback Score": avg ?? "",
      };
    });
  };

  // Feedback trend rows (grouped by month)
  const trendRows = () => {
    const buckets = new Map<string, { total: number; sent: number; ack: number; sumScore: number; scored: number }>();
    for (const f of feedback as any[]) {
      const key = monthKey(f.created_at);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, { total: 0, sent: 0, ack: 0, sumScore: 0, scored: 0 });
      const b = buckets.get(key)!;
      b.total += 1;
      if (f.sent_at) b.sent += 1;
      if (f.acknowledged_at) b.ack += 1;
      if (typeof f.score === "number") { b.sumScore += f.score; b.scored += 1; }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({
        Month: month,
        Total: b.total,
        Sent: b.sent,
        Acknowledged: b.ack,
        "Ack Rate %": b.sent ? Math.round((b.ack / b.sent) * 100) : 0,
        "Avg Score": b.scored ? Math.round(b.sumScore / b.scored) : "",
      }));
  };

  // Email delivery rows (per feedback)
  const emailRows = () => {
    return (feedback as any[]).map((f) => ({
      Title: f.title,
      Agent: f.agent?.full_name ?? "",
      Status: f.status,
      Sent: safeDateTime(f.sent_at),
      Acknowledged: safeDateTime(f.acknowledged_at),
      Severity: f.severity ?? "",
    }));
  };

  const run = async (name: string, rows: any[], fn: () => void) => {
    if (!rows.length) { toast.error("No data to export yet"); return; }
    setBusy(name);
    try { fn(); } catch (e: any) { toast.error(e.message ?? "Export failed"); }
    finally { setBusy(null); }
  };

  const REPORTS = [
    {
      key: "agent-performance",
      icon: Users,
      title: "Agent Performance",
      desc: "Quality scores, feedback counts, and averages per agent.",
      getRows: perfRows,
      csv: (rows: any[]) => toCsv(rows, "agent-performance.csv"),
      pdf: (rows: any[]) => toPdf({
        title: "Agent Performance Report",
        subtitle: `${rows.length} agents`,
        filename: "agent-performance.pdf",
        sections: [{
          title: "Roster performance",
          columns: rows.length ? Object.keys(rows[0]) : [],
          rows: rows.map((r) => Object.values(r) as (string | number)[]),
        }],
      }),
    },
    {
      key: "feedback-trends",
      icon: TrendingUp,
      title: "Feedback Trends",
      desc: "Monthly feedback volume, ack rate, and average score.",
      getRows: trendRows,
      csv: (rows: any[]) => toCsv(rows, "feedback-trends.csv"),
      pdf: (rows: any[]) => toPdf({
        title: "Feedback Trends Report",
        subtitle: `${rows.length} months`,
        filename: "feedback-trends.pdf",
        sections: [{
          title: "Monthly breakdown",
          columns: rows.length ? Object.keys(rows[0]) : [],
          rows: rows.map((r) => Object.values(r) as (string | number)[]),
        }],
      }),
    },
    {
      key: "email-delivery",
      icon: Mail,
      title: "Email Delivery",
      desc: "Send / acknowledgement status for every feedback item.",
      getRows: emailRows,
      csv: (rows: any[]) => toCsv(rows, "email-delivery.csv"),
      pdf: (rows: any[]) => toPdf({
        title: "Email Delivery Report",
        subtitle: `${rows.length} feedback items`,
        filename: "email-delivery.pdf",
        sections: [{
          title: "Delivery status",
          columns: rows.length ? Object.keys(rows[0]) : [],
          rows: rows.map((r) => Object.values(r) as (string | number)[]),
        }],
      }),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Export performance, trends, and delivery data as PDF or CSV."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/reports/schedules"><CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Scheduled reports</Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-5xl px-8 pb-12 pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => (
          <Card key={r.key} className="p-5 flex flex-col">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
                <r.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold">{r.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.desc}</p>
              </div>
            </div>
            <div className="mt-auto pt-5 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                disabled={dataLoading || busy === r.key + ":pdf"}
                onClick={() => { const rows = r.getRows(); run(r.key + ":pdf", rows, () => r.pdf(rows)); }}
              >
                <FileText className="h-3.5 w-3.5" />
                {dataLoading ? "Loading…" : "PDF"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                disabled={dataLoading || busy === r.key + ":csv"}
                onClick={() => { const rows = r.getRows(); run(r.key + ":csv", rows, () => r.csv(rows)); }}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {dataLoading ? "Loading…" : "CSV"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
