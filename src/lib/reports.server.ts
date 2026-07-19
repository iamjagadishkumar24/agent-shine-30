// Server-only report generators. Return PDF bytes + CSV strings for a given
// report type, using service-role Supabase to bypass RLS. Import only from
// server-fn handlers or server route handlers.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ReportType = "agent_performance" | "feedback_trends" | "email_delivery";

type Row = Record<string, string | number | null>;

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Row[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))].join("\n");
}

export function rowsToPdf(opts: { title: string; subtitle?: string; rows: Row[] }): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(opts.title, 40, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 195);
  if (opts.subtitle) doc.text(opts.subtitle, 40, 52);
  doc.text(`Generated ${new Date().toUTCString()}`, pageW - 40, 52, { align: "right" });

  const cols = opts.rows.length ? Object.keys(opts.rows[0]) : [];
  autoTable(doc, {
    startY: 100,
    head: [cols],
    body: opts.rows.map((r) => cols.map((c) => (r[c] == null ? "" : String(r[c])))),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 246, 250] },
    margin: { left: 40, right: 40 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pageCount} · Zenwork Performance Manager`, pageW - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}

export async function buildReportRows(
  supabaseAdmin: any,
  type: ReportType,
): Promise<{ title: string; subtitle: string; rows: Row[] }> {
  const [{ data: agents }, { data: feedback }] = await Promise.all([
    supabaseAdmin.from("agents").select("id, full_name, employee_id, department, team, qa_score, status"),
    supabaseAdmin
      .from("feedback")
      .select("id, title, feedback_type, severity, status, category, score, created_at, sent_at, acknowledged_at, agent:agents(full_name, department)")
      .order("created_at", { ascending: false }),
  ]);

  const A = (agents ?? []) as any[];
  const F = (feedback ?? []) as any[];

  if (type === "agent_performance") {
    const byAgent = new Map<string, any[]>();
    for (const f of F) {
      const k = f.agent?.full_name ?? "—";
      if (!byAgent.has(k)) byAgent.set(k, []);
      byAgent.get(k)!.push(f);
    }
    const rows: Row[] = A.map((a) => {
      const fs = byAgent.get(a.full_name) ?? [];
      const scores = fs.map((f) => f.score).filter((s: any) => typeof s === "number");
      const avg = scores.length ? Math.round(scores.reduce((s: number, n: number) => s + n, 0) / scores.length) : null;
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
    return { title: "Agent Performance Report", subtitle: `${rows.length} agents`, rows };
  }

  if (type === "feedback_trends") {
    const buckets = new Map<string, { total: number; sent: number; ack: number; sumScore: number; scored: number }>();
    for (const f of F) {
      const d = new Date(f.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets.has(k)) buckets.set(k, { total: 0, sent: 0, ack: 0, sumScore: 0, scored: 0 });
      const b = buckets.get(k)!;
      b.total += 1;
      if (f.sent_at) b.sent += 1;
      if (f.acknowledged_at) b.ack += 1;
      if (typeof f.score === "number") { b.sumScore += f.score; b.scored += 1; }
    }
    const rows: Row[] = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({
        Month: month,
        Total: b.total,
        Sent: b.sent,
        Acknowledged: b.ack,
        "Ack Rate %": b.sent ? Math.round((b.ack / b.sent) * 100) : 0,
        "Avg Score": b.scored ? Math.round(b.sumScore / b.scored) : "",
      }));
    return { title: "Feedback Trends Report", subtitle: `${rows.length} months`, rows };
  }

  const rows: Row[] = F.map((f) => ({
    Title: f.title,
    Agent: f.agent?.full_name ?? "",
    Status: f.status,
    Sent: f.sent_at ? new Date(f.sent_at).toISOString() : "",
    Acknowledged: f.acknowledged_at ? new Date(f.acknowledged_at).toISOString() : "",
    Severity: f.severity ?? "",
  }));
  return { title: "Email Delivery Report", subtitle: `${rows.length} feedback items`, rows };
}

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  agent_performance: "Agent Performance",
  feedback_trends: "Feedback Trends",
  email_delivery: "Email Delivery",
};
