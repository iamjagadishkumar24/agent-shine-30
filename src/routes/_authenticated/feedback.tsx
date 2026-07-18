import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, subDays } from "date-fns";
import { SkeletonBox } from "@/components/ui/skeleton-blocks";

type Range = "7d" | "30d" | "90d" | "all";

type FeedbackSearch = {
  status?: string;
  severity?: string;
  type?: string;
  category?: string;
  agent_id?: string;
  range?: Range;
};

const ALLOWED_STATUS = new Set([
  "draft", "review", "approved", "rejected", "revision_required",
  "sent", "acknowledged", "completed", "pending", "high_priority",
]);
const ALLOWED_SEV = new Set(["low", "medium", "high", "critical"]);
const ALLOWED_RANGE = new Set(["7d", "30d", "90d", "all"]);

export const Route = createFileRoute("/_authenticated/feedback")({
  validateSearch: (raw: Record<string, unknown>): FeedbackSearch => {
    const s = raw as any;
    return {
      status: typeof s.status === "string" && ALLOWED_STATUS.has(s.status) ? s.status : undefined,
      severity: typeof s.severity === "string" && ALLOWED_SEV.has(s.severity) ? s.severity : undefined,
      type: typeof s.type === "string" ? s.type : undefined,
      category: typeof s.category === "string" ? s.category : undefined,
      agent_id: typeof s.agent_id === "string" ? s.agent_id : undefined,
      range: typeof s.range === "string" && ALLOWED_RANGE.has(s.range) ? (s.range as Range) : undefined,
    };
  },
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
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

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

  // Filter rows client-side based on URL search params
  const rows = useMemo(() => {
    const all = data as any[];
    const cutoff =
      search.range === "7d" ? subDays(new Date(), 7).getTime() :
      search.range === "30d" ? subDays(new Date(), 30).getTime() :
      search.range === "90d" ? subDays(new Date(), 90).getTime() : null;

    return all.filter((f) => {
      if (search.status === "pending") {
        if (!["draft", "review"].includes(f.status)) return false;
      } else if (search.status === "high_priority") {
        if (!["critical", "high"].includes(f.severity)) return false;
      } else if (search.status && f.status !== search.status) return false;

      if (search.severity && f.severity !== search.severity) return false;
      if (search.type && f.feedback_type !== search.type) return false;
      if (search.category && f.category !== search.category) return false;
      if (search.agent_id && f.agent_id !== search.agent_id) return false;
      if (cutoff && new Date(f.created_at).getTime() < cutoff) return false;
      return true;
    });
  }, [data, search]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const showVirtual = rows.length > 30;

  const activeFilters: Array<{ key: keyof FeedbackSearch; label: string }> = [];
  if (search.status) activeFilters.push({ key: "status", label: `Status: ${search.status.replace(/_/g, " ")}` });
  if (search.severity) activeFilters.push({ key: "severity", label: `Severity: ${search.severity}` });
  if (search.type) activeFilters.push({ key: "type", label: `Type: ${search.type}` });
  if (search.category) activeFilters.push({ key: "category", label: `Category: ${search.category}` });
  if (search.agent_id) activeFilters.push({ key: "agent_id", label: `Agent filtered` });
  if (search.range) activeFilters.push({ key: "range", label: `Last ${search.range}` });

  const clearFilter = (key: keyof FeedbackSearch) => {
    navigate({ search: (prev) => ({ ...prev, [key]: undefined }) });
  };
  const clearAll = () => navigate({ search: () => ({}) });

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={`${rows.length} ${rows.length === 1 ? "item" : "items"}${activeFilters.length ? ` · filtered from ${data.length}` : ""}`}
        actions={
          <Button size="sm" asChild>
            <Link to="/feedback/new"><Plus className="mr-1.5 h-3.5 w-3.5" /> New feedback</Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-7xl px-8 pb-12 pt-6 animate-in fade-in duration-300">
        {activeFilters.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
            </div>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => clearFilter(f.key)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs capitalize backdrop-blur-xl transition hover:border-border hover:bg-muted/40"
              >
                <span>{f.label}</span>
                <X className="h-3 w-3 text-muted-foreground transition group-hover:text-foreground" />
              </button>
            ))}
            <button
              onClick={clearAll}
              className="text-xs text-primary hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

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
              <div className="text-sm text-muted-foreground">
                {activeFilters.length ? "No feedback matches these filters." : "No feedback yet."}
              </div>
              {activeFilters.length > 0 ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" className="mt-3" asChild>
                  <Link to="/feedback/new"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create first feedback</Link>
                </Button>
              )}
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
          {f.status?.replace(/_/g, " ")}
        </span>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
      </div>
    </div>
  );
}
