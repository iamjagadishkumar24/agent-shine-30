import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/feedback")({
  component: FeedbackPage,
});

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
  approved: "bg-primary/15 text-primary",
  sent: "bg-primary/15 text-primary",
  acknowledged: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
  completed: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
};

const SEV_TONE: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-[oklch(0.78_0.16_75)]",
  critical: "text-destructive",
};

function FeedbackPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["feedback-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*, agent:agents(full_name, employee_id, department)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={`${data.length} items`}
        actions={
          <Button size="sm" asChild>
            <Link to="/feedback/new"><Plus className="mr-1.5 h-3.5 w-3.5" /> New feedback</Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-7xl px-8 pb-12 pt-6">
        <Card className="overflow-hidden rounded-xl border-border/60 bg-card/60">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</td></tr>}
              {data.map((f: any) => (
                <tr key={f.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <Link to="/feedback/$id" params={{ id: f.id }} className="font-medium hover:underline">{f.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{f.agent?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.category}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{f.feedback_type}</td>
                  <td className={cn("px-4 py-3 capitalize text-xs", SEV_TONE[f.severity])}>{f.severity}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize", STATUS_TONE[f.status])}>{f.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}</td>
                </tr>
              ))}
              {!isLoading && data.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center">
                  <div className="text-sm text-muted-foreground">No feedback yet.</div>
                  <Button size="sm" className="mt-3" asChild><Link to="/feedback/new"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create first feedback</Link></Button>
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
