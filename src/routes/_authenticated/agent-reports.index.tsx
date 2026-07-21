import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowRight, FileSpreadsheet } from "lucide-react";
import { listAgentReports } from "@/lib/agent-reports.functions";
import { format } from "date-fns";
import { toCsv } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/agent-reports/")({
  component: AgentReportsList,
});

function AgentReportsList() {
  const fn = useServerFn(listAgentReports);
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["agent-reports"], queryFn: () => fn() });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rows as any[]).filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (s && !`${r.full_name} ${r.email ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [rows, search, status]);

  const exportCsv = () => {
    toCsv(filtered.map((r: any) => ({
      Agent: r.full_name,
      Email: r.email ?? "",
      Department: r.department ?? "",
      "Total Feedback": r.total_feedback,
      "Avg Score": r.avg_score ?? "",
      "Highest": r.highest_score ?? "",
      "Lowest": r.lowest_score ?? "",
      "Acknowledged": r.acknowledged_count,
      "Pending": r.pending_count,
      "Chat": r.chat_count,
      "Case": r.case_count,
      "Last Feedback": r.last_feedback_at ? format(new Date(r.last_feedback_at), "yyyy-MM-dd") : "",
    })), "agent-reports.csv");
  };

  return (
    <div>
      <PageHeader
        title="Agent Reports"
        subtitle="Complete historical view of every agent's feedback and performance."
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        }
      />
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-16 pt-4 sm:px-8">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name or email…"
                className="h-9 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">{filtered.length} agents</div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Agent</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Avg</th>
                  <th className="px-4 py-3 text-right font-medium">High</th>
                  <th className="px-4 py-3 text-right font-medium">Low</th>
                  <th className="px-4 py-3 text-right font-medium">Ack</th>
                  <th className="px-4 py-3 text-right font-medium">Pending</th>
                  <th className="px-4 py-3 text-right font-medium">Chat / Case</th>
                  <th className="px-4 py-3 text-left font-medium">Last feedback</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading && <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">No agents match.</td></tr>
                )}
                {filtered.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.email ?? r.employee_id ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.total_feedback}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.avg_score ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{r.highest_score ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600">{r.lowest_score ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.acknowledged_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.pending_count > 0 ? <Badge variant="outline" className="bg-amber-500/10 text-amber-700">{r.pending_count}</Badge> : "0"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{r.chat_count} / {r.case_count}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.last_feedback_at ? format(new Date(r.last_feedback_at), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/agent-reports/$id"
                        params={{ id: r.id }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
