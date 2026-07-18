import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { CoachingTabs } from "@/components/coaching/coaching-tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, GraduationCap, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching")({
  component: CoachingList,
});

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  canceled: "bg-muted text-muted-foreground border-border",
  no_show: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function CoachingList() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["coaching-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_sessions")
        .select("*, agent:agents(id, full_name, department), items:coaching_action_items(id, status)")
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Coaching"
        subtitle={`${data.length} session${data.length === 1 ? "" : "s"}`}
        actions={
          <Link to="/coaching/new">
            <Button size="sm" className="h-8 gap-1.5">
              <CalendarPlus className="h-3.5 w-3.5" /> Schedule session
            </Button>
          </Link>
        }
      />
      <CoachingTabs />
      <div className="mx-auto max-w-6xl px-8 pb-12 pt-4">

        {isLoading ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">Loading…</Card>
        ) : data.length === 0 ? (
          <Card className="p-10 text-center">
            <GraduationCap className="mx-auto h-6 w-6 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-medium">No sessions yet</h2>
            <p className="mt-1 text-xs text-muted-foreground">Schedule a 1-on-1 with an agent, optionally tied to a feedback item.</p>
            <Link to="/coaching/new"><Button size="sm" className="mt-4">Schedule the first session</Button></Link>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Topic</th>
                  <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                  <th className="px-4 py-2.5 text-left font-medium">Scheduled</th>
                  <th className="px-4 py-2.5 text-left font-medium">Duration</th>
                  <th className="px-4 py-2.5 text-left font-medium">Action items</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s: any) => {
                  const items = s.items ?? [];
                  const done = items.filter((i: any) => i.status === "done").length;
                  return (
                    <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <Link to="/coaching/$id" params={{ id: s.id }} className="font-medium hover:text-primary">
                          {s.topic}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {s.agent?.full_name}
                        {s.agent?.department && <span className="ml-1.5 text-xs">· {s.agent.department}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {new Date(s.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.duration_minutes}m</span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {items.length === 0 ? "—" : `${done}/${items.length} done`}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={cn("text-xs capitalize", STATUS_STYLES[s.status])}>
                          {s.status.replace("_", " ")}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
