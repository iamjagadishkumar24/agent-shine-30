import { createFileRoute, Link } from "@tanstack/react-router";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Filter, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, subDays, format } from "date-fns";
import { SkeletonBox } from "@/components/ui/skeleton-blocks";
import { toCsv, downloadCsv } from "@/lib/csv";
import { bulkDeleteFeedback } from "@/lib/bulk-operations.functions";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function safeTimeAgo(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

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
  "draft", "ready_to_send", "sent", "acknowledged", "completed", "failed",
  "pending", "high_priority",
]);
const ALLOWED_SEV = new Set(["low", "medium", "high", "critical"]);
const ALLOWED_RANGE = new Set(["7d", "30d", "90d", "all"]);

export const Route = createFileRoute("/_authenticated/feedback/")({
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
  ready_to_send: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
  sent: "bg-primary/15 text-primary",
  failed: "bg-destructive/15 text-destructive",
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
const GRID = "grid-cols-[32px_minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)]";

function FeedbackPage() {
  useRealtimeInvalidate("feedback", [["feedback-list"], ["dashboard"]]);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const del = useServerFn(bulkDeleteFeedback);


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

  const rows = useMemo(() => {
    const all = data as any[];
    const cutoff =
      search.range === "7d" ? subDays(new Date(), 7).getTime() :
      search.range === "30d" ? subDays(new Date(), 30).getTime() :
      search.range === "90d" ? subDays(new Date(), 90).getTime() : null;

    return all.filter((f) => {
      if (search.status === "pending") {
        if (!["draft", "ready_to_send"].includes(f.status)) return false;

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

  const clearFilter = (key: keyof FeedbackSearch) =>
    navigate({ search: (prev: FeedbackSearch) => ({ ...prev, [key]: undefined }) });
  const clearAll = () => navigate({ search: () => ({} as FeedbackSearch) });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const invalidate = () => {
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["feedback-list"] });
  };

  const approveMut = useMutation({
    mutationFn: () => approve({ data: { ids: [...selected] } }),
    onSuccess: (r) => { toast.success(`Approved ${r.updated} feedback item(s)`); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to approve"),
  });
  const rejectMut = useMutation({
    mutationFn: () => reject({ data: { ids: [...selected] } }),
    onSuccess: (r) => { toast.success(`Rejected ${r.updated} feedback item(s)`); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to reject"),
  });
  const delMut = useMutation({
    mutationFn: () => del({ data: { ids: [...selected] } }),
    onSuccess: (r) => { toast.success(`Deleted ${r.deleted} feedback item(s)`); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  const exportCsv = () => {
    const source = selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : rows;
    if (source.length === 0) { toast.error("Nothing to export"); return; }
    const csv = toCsv(source.map((f) => ({
      id: f.id,
      title: f.title,
      agent: f.agent?.full_name ?? "",
      employee_id: f.agent?.employee_id ?? "",
      department: f.agent?.department ?? "",
      category: f.category,
      type: f.feedback_type,
      severity: f.severity,
      status: f.status,
      created_at: f.created_at,
    })));
    downloadCsv(`feedback-${format(new Date(), "yyyyMMdd-HHmm")}.csv`, csv);
    toast.success(`Exported ${source.length} row(s)`);
  };

  return (
    <div>
      <PageHeader
        title="Feedback"
        subtitle={`${rows.length} ${rows.length === 1 ? "item" : "items"}${activeFilters.length ? ` · filtered from ${data.length}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" asChild>
              <Link to="/feedback/new"><Plus className="mr-1.5 h-3.5 w-3.5" /> New feedback</Link>
            </Button>
          </div>
        }
      />
      <div className="mx-auto max-w-7xl px-8 pb-12 pt-6 animate-in fade-in duration-300">
        {activeFilters.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /><span>Filters</span>
            </div>
            {activeFilters.map((f) => (
              <button key={f.key} onClick={() => clearFilter(f.key)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs capitalize backdrop-blur-xl transition hover:border-border hover:bg-muted/40">
                <span>{f.label}</span>
                <X className="h-3 w-3 text-muted-foreground transition group-hover:text-foreground" />
              </button>
            ))}
            <button onClick={clearAll} className="text-xs text-primary hover:underline">Clear all</button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm animate-in fade-in slide-in-from-top-1">
            <div className="font-medium">{selected.size} selected</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
              </Button>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={delMut.isPending}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selected.size} feedback item{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the selected feedback along with their attachments, audit trail, and delivery history. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => delMut.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
        )}

        <Card className="overflow-hidden rounded-xl border-border/60 bg-card/60">
          <div className={cn("grid gap-2 border-b border-border/60 px-4 py-2.5 text-left text-xs text-muted-foreground", GRID)}>
            <div className="flex items-center">
              <Checkbox
                checked={allSelected || (someSelected ? "indeterminate" : false)}
                onCheckedChange={toggleAll}
                aria-label="Select all"
              />
            </div>
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
              {Array.from({ length: 8 }).map((_, i) => <SkeletonBox key={i} className="h-9 w-full" />)}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="text-sm text-muted-foreground">
                {activeFilters.length ? "No feedback matches these filters." : "No feedback yet."}
              </div>
              {activeFilters.length > 0 ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={clearAll}>Clear filters</Button>
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
                <FeedbackRow key={f.id} f={f} selected={selected.has(f.id)} onToggle={() => toggleOne(f.id)} />
              ))}
            </div>
          )}

          {!isLoading && showVirtual && (
            <div ref={parentRef} className="max-h-[calc(100vh-260px)] overflow-auto" style={{ contain: "strict" }}>
              <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
                {virtualizer.getVirtualItems().map((vRow) => {
                  const f = rows[vRow.index];
                  return (
                    <div key={vRow.key} data-index={vRow.index} ref={virtualizer.measureElement}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vRow.start}px)` }}>
                      <FeedbackRow f={f} selected={selected.has(f.id)} onToggle={() => toggleOne(f.id)} />
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

function FeedbackRow({ f, selected, onToggle }: { f: any; selected: boolean; onToggle: () => void }) {
  return (
    <div className={cn(
      "grid items-center gap-2 border-b border-border/40 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-accent/30",
      GRID,
      selected && "bg-primary/5",
    )}>
      <div className="flex items-center">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${f.title}`} />
      </div>
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
        {safeTimeAgo(f.created_at)}
      </div>
    </div>
  );
}
