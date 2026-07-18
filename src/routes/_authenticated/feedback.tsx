import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { SkeletonBox } from "@/components/ui/skeleton-blocks";

export const Route = createFileRoute("/_authenticated/feedback")({
  component: FeedbackPage,
});

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
  approved: "bg-primary/15 text-primary",
  rejected: "bg-destructive/15 text-destructive",
  revision_required: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
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

const ROW_HEIGHT = 52;

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

  const rows = useMemo(() => data as any[], [data]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const showVirtual = rows.length > 30;

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
      <div className="mx-auto max-w-7xl px-8 pb-12 pt-6 animate-in fade-in duration-300">
        <Card className="overflow-hidden rounded-xl border-border/60 bg-card/60">
          {/* Header */}
          <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] gap-2 border-b border-border/60 px-4 py-2.5 text-left text-xs text-muted-foreground">
            <div>Title</div>
            <div>Agent</div>
            <div>Category</div>
            <div>Type</div>
            <div>Severity</div>
            <div>Status</div>
            <div className="text-right">Created</div>
          </div>

          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonBox key={i} className="h-9 w-full" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="text-sm text-muted-foreground">No feedback yet.</div>
              <Button size="sm" className="mt-3" asChild>
                <Link to="/feedback/new"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create first feedback</Link>
              </Button>
            </div>
          )}

          {!isLoading && rows.length > 0 && !showVirtual && (
            <div>
              {rows.map((f) => (
                <FeedbackRow key={f.id} f={f} />
              ))}
            </div>
          )}

          {!isLoading && showVirtual && (
            <div
              ref={parentRef}
              className="max-h-[calc(100vh-260px)] overflow-auto"
              style={{ contain: "strict" }}
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((vRow) => {
                  const f = rows[vRow.index];
                  return (
                    <div
                      key={vRow.key}
                      data-index={vRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${vRow.start}px)`,
                      }}
                    >
                      <FeedbackRow f={f} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function FeedbackRow({ f }: { f: any }) {
  return (
    <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] items-center gap-2 border-b border-border/40 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-accent/30">
      <div className="min-w-0 truncate">
        <Link to="/feedback/$id" params={{ id: f.id }} className="font-medium hover:underline">
          {f.title}
        </Link>
      </div>
      <div className="min-w-0 truncate text-muted-foreground">{f.agent?.full_name ?? "—"}</div>
      <div className="min-w-0 truncate text-muted-foreground">{f.category}</div>
      <div className="min-w-0 truncate capitalize text-muted-foreground">{f.feedback_type}</div>
      <div className={cn("min-w-0 truncate text-xs capitalize", SEV_TONE[f.severity])}>{f.severity}</div>
      <div className="min-w-0">
        <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize", STATUS_TONE[f.status])}>
          {f.status}
        </span>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
      </div>
    </div>
  );
}
