import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { CoachingTabs } from "@/components/coaching/coaching-tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

function safeDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export const Route = createFileRoute("/_authenticated/coaching/plans")({
  component: PlansList,
});

const PLAN_STATUS: Record<string, string> = {
  active: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  archived: "bg-muted text-muted-foreground border-border",
};

function planProgress(goals: Array<{ current_value: number | null; target_value: number | null; status: string; weight: number | null }>) {
  if (!goals.length) return 0;
  let totalWeight = 0;
  let weighted = 0;
  for (const g of goals) {
    const w = g.weight ?? 1;
    totalWeight += w;
    let pct = 0;
    if (g.status === "achieved") pct = 100;
    else if (g.target_value && g.target_value > 0) {
      pct = Math.min(100, Math.max(0, ((g.current_value ?? 0) / g.target_value) * 100));
    }
    weighted += pct * w;
  }
  return totalWeight ? Math.round(weighted / totalWeight) : 0;
}

function PlansList() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["coaching-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_plans")
        .select("*, agent:agents(id, full_name, department), goals:coaching_goals(id, current_value, target_value, status, weight)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Coaching plans"
        subtitle={`${data.length} plan${data.length === 1 ? "" : "s"} · track goals and progress over time`}
        actions={
          <Link to="/coaching/plans/new">
            <Button size="sm" className="h-8 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New plan
            </Button>
          </Link>
        }
      />
      <CoachingTabs />
      <div className="mx-auto max-w-6xl px-8 pb-12 pt-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-1.5 w-full animate-pulse rounded bg-muted" />
                <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-muted" />
              </Card>
            ))}
          </div>
        ) : data.length === 0 ? (
          <Card className="p-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-medium">No coaching plans yet</h2>
            <p className="mt-1 text-xs text-muted-foreground">Create a plan to set goals and track progress across sessions.</p>
            <Link to="/coaching/plans/new"><Button size="sm" className="mt-4">Create the first plan</Button></Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((p: any) => {
              const goals = p.goals ?? [];
              const pct = planProgress(goals);
              const achieved = goals.filter((g: any) => g.status === "achieved").length;
              return (
                <Link key={p.id} to="/coaching/plans/$id" params={{ id: p.id }} className="group">
                  <Card className="p-4 hover:border-primary/50 transition h-full">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium truncate group-hover:text-primary">{p.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.agent?.full_name}
                          {p.agent?.department && <span> · {p.agent.department}</span>}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("text-xs capitalize", PLAN_STATUS[p.status])}>
                        {p.status}
                      </Badge>
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{p.description}</p>}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground inline-flex items-center gap-1"><Target className="h-3 w-3" /> {achieved}/{goals.length} goals</span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>Started {safeDate(p.start_date)}</span>
                      {p.target_date && <span>· Target {safeDate(p.target_date)}</span>}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
