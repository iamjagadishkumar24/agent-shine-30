import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet, Users, TrendingUp, Mail, CalendarClock } from "lucide-react";
import { toCsv, toPdf } from "@/lib/reports";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const [busy, setBusy] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: ["report-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents")
        .select("id, full_name, employee_id, department, team, qa_score, status");
      if (error) throw error;
      return data;
    },
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ["report-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase.from("feedback")
        .select("id, title, feedback_type, severity, status, category, score, created_at, sent_at, acknowledged_at, agent:agents(full_name, department)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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
        "QA Score": a.qa_score ?? "",
        "Feedback Count": fs.length,
        "Avg Feedback Score": avg ?? "",
      };
    });
  };

  // Feedback trend rows (grouped by month)
  const trendRows = () => {
    const buckets = new Map<string, { total: number; sent: number; ack: number; sumScore: number; scored: number }>();
    for (const f of feedback as any[]) {
      const d = new Date(f.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
      Sent: f.sent_at ? new Date(f.sent_at).toLocaleString() : "",
      Acknowledged: f.acknowledged_at ? new Date(f.acknowledged_at).toLocaleString() : "",
      Severity: f.severity ?? "",
    }));
  };

  const run = async (name: string, rows: any[], fn: () => void) => {
    if (!rows.length) { toast.error("No data to export yet"); return; }
    setBusy(name);
    try { fn(); toast.success("Export ready"); } catch (e: any) { toast.error(e.message ?? "Export failed"); }
    finally { setBusy(null); }
  };

  const REPORTS = [
    {
      key: "agent-performance",
      icon: Users,
      title: "Agent Performance",
      desc: "QA scores, feedback counts, and averages per agent.",
      csv: () => toCsv(perfRows(), "agent-performance.csv"),
      pdf: () => {
        const rows = perfRows();
        toPdf({
          title: "Agent Performance Report",
          subtitle: `${rows.length} agents`,
          filename: "agent-performance.pdf",
          sections: [{
            title: "Roster performance",
            columns: rows.length ? Object.keys(rows[0]) : [],
            rows: rows.map((r) => Object.values(r) as (string | number)[]),
          }],
        });
      },
    },
    {
      key: "feedback-trends",
      icon: TrendingUp,
      title: "Feedback Trends",
      desc: "Monthly feedback volume, ack rate, and average score.",
      csv: () => toCsv(trendRows(), "feedback-trends.csv"),
      pdf: () => {
        const rows = trendRows();
        toPdf({
          title: "Feedback Trends Report",
          subtitle: `${rows.length} months`,
          filename: "feedback-trends.pdf",
          sections: [{
            title: "Monthly breakdown",
            columns: rows.length ? Object.keys(rows[0]) : [],
            rows: rows.map((r) => Object.values(r) as (string | number)[]),
          }],
        });
      },
    },
    {
      key: "email-delivery",
      icon: Mail,
      title: "Email Delivery",
      desc: "Send / acknowledgement status for every feedback item.",
      csv: () => toCsv(emailRows(), "email-delivery.csv"),
      pdf: () => {
        const rows = emailRows();
        toPdf({
          title: "Email Delivery Report",
          subtitle: `${rows.length} feedback items`,
          filename: "email-delivery.pdf",
          sections: [{
            title: "Delivery status",
            columns: rows.length ? Object.keys(rows[0]) : [],
            rows: rows.map((r) => Object.values(r) as (string | number)[]),
          }],
        });
      },
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
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" disabled={busy === r.key + ":pdf"}
                onClick={() => run(r.key + ":pdf", r.pdf)}>
                <FileText className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" disabled={busy === r.key + ":csv"}
                onClick={() => run(r.key + ":csv", r.csv)}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
