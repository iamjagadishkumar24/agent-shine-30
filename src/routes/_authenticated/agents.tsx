import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
});

function AgentsPage() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").order("qa_score", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = data.filter((a) =>
    !q || [a.full_name, a.employee_id, a.email, a.department, a.team].some((f) => f?.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle={`${data.length} team members`}
        actions={
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…" className="h-8 w-64 pl-8 text-sm" />
          </div>
        }
      />
      <div className="mx-auto max-w-7xl px-8 pb-12 pt-6">
        <Card className="overflow-hidden rounded-xl border-border/60 bg-card/60">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Department</th>
                <th className="px-4 py-2.5 font-medium">Team</th>
                <th className="px-4 py-2.5 font-medium">Manager</th>
                <th className="px-4 py-2.5 font-medium text-right">QA Score</th>
                <th className="px-4 py-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>
              )}
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-[11px] font-medium text-primary">
                        {a.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <Link to="/feedback/new" search={{ agent: a.id }} className="font-medium hover:underline">{a.full_name}</Link>
                        <div className="text-xs text-muted-foreground">{a.employee_id} · {a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.department}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.team ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.manager_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                      Number(a.qa_score) >= 90 ? "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]" :
                      Number(a.qa_score) >= 75 ? "bg-primary/15 text-primary" :
                      "bg-destructive/15 text-destructive"
                    )}>
                      {Number(a.qa_score).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.16_160)]" />
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No agents match “{q}”.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
