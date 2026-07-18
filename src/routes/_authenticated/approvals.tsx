import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonBox } from "@/components/ui/skeleton-blocks";
import { transitionFeedback } from "@/lib/feedback-workflow.functions";
import { CheckCircle2, XCircle, RotateCcw, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function safeTimeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

const SLA_HOURS = 24;
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };


export const Route = createFileRoute("/_authenticated/approvals")({
  component: ApprovalsPage,
});

const SEV_TONE: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-[oklch(0.78_0.16_75)]",
  critical: "text-destructive",
};


type SevFilter = "all" | "critical" | "high" | "medium" | "low";

function ApprovalsPage() {
  const qc = useQueryClient();
  const transitionFn = useServerFn(transitionFeedback);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sevFilter, setSevFilter] = useState<SevFilter>("all");


  const { data = [], isLoading } = useQuery({
    queryKey: ["approval-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*, agent:agents(full_name, employee_id, department)")
        .eq("status", "review")
        .order("submitted_for_review_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const sortedFiltered = useMemo(() => {
    const arr = Array.isArray(data) ? [...data] : [];
    arr.sort((a: any, b: any) => {
      const sa = SEV_ORDER[a.severity] ?? 99;
      const sb = SEV_ORDER[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      const ta = a.submitted_for_review_at ? new Date(a.submitted_for_review_at).getTime() : 0;
      const tb = b.submitted_for_review_at ? new Date(b.submitted_for_review_at).getTime() : 0;
      return ta - tb;
    });
    if (sevFilter === "all") return arr;
    return arr.filter((f: any) => f.severity === sevFilter);
  }, [data, sevFilter]);

  const sevCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of (data as any[]) ?? []) {
      if (f.severity && counts[f.severity] !== undefined) counts[f.severity] += 1;
    }
    return counts;
  }, [data]);

  const act = useMutation({
    mutationFn: (payload: Parameters<typeof transitionFn>[0]["data"]) =>
      transitionFn({ data: payload }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.type === "approve"
          ? "Approved"
          : vars.type === "reject"
            ? "Rejected"
            : "Revision requested",
      );
      setOpenId(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalCount = (data as any[])?.length ?? 0;
  const criticalCount = sevCounts.critical + sevCounts.high;

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle={
          totalCount === 0
            ? "Nothing pending review"
            : `${totalCount} awaiting review${criticalCount ? ` · ${criticalCount} high/critical` : ""}`
        }
      />
      <div className="mx-auto max-w-6xl px-8 pb-16 pt-6 space-y-3 animate-in fade-in duration-300">
        {!isLoading && totalCount > 0 && (
          <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs w-fit">
            {(["all", "critical", "high", "medium", "low"] as const).map((f) => {
              const count = f === "all" ? totalCount : sevCounts[f] ?? 0;
              return (
                <button
                  key={f}
                  onClick={() => setSevFilter(f)}
                  className={cn(
                    "rounded-md px-2.5 py-1 capitalize transition-colors",
                    sevFilter === f
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {isLoading && Array.from({ length: 4 }).map((_, i) => <SkeletonBox key={i} className="h-32 w-full" />)}

        {!isLoading && totalCount === 0 && (
          <Card className="rounded-xl border-border/60 bg-card/60 p-12 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <div className="mt-3 text-sm font-medium">Queue is empty</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Feedback drafts submitted for review will appear here.
            </div>
          </Card>
        )}

        {!isLoading && totalCount > 0 && sortedFiltered.length === 0 && (
          <Card className="rounded-xl border-border/60 bg-card/60 p-8 text-center text-xs text-muted-foreground">
            No items match the {sevFilter} filter.
          </Card>
        )}

        {sortedFiltered.map((f: any) => {
          const isOpen = openId === f.id;
          const submittedAt = f.submitted_for_review_at ? new Date(f.submitted_for_review_at) : null;
          const ageHours = submittedAt && !Number.isNaN(submittedAt.getTime())
            ? (Date.now() - submittedAt.getTime()) / 3_600_000
            : 0;
          const slaBreached = ageHours > SLA_HOURS;
          const severity = f.severity ?? "medium";
          return (
            <Card
              key={f.id}
              className={cn(
                "rounded-xl border-border/60 bg-card/60 p-5",
                slaBreached && "border-destructive/40",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to="/feedback/$id" params={{ id: f.id }} className="text-sm font-medium hover:underline truncate">
                      {f.title || "Untitled feedback"}
                    </Link>
                    <span className={cn("text-xs capitalize", SEV_TONE[severity] ?? "text-muted-foreground")}>
                      · {severity}
                    </span>
                    {slaBreached && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                        <AlertTriangle className="h-2.5 w-2.5" /> SLA breach
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {f.agent?.full_name ?? "Unassigned agent"}
                    {f.category ? ` · ${f.category}` : ""}
                    {f.feedback_type ? ` · ${String(f.feedback_type).replace(/_/g, " ")}` : ""}
                    {submittedAt && <> · submitted {safeTimeAgo(f.submitted_for_review_at)}</>}
                  </div>
                  {f.summary && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/90">{f.summary}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOpenId(isOpen ? null : f.id);
                      setNote("");
                    }}
                  >
                    Review
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reviewer note (required for reject / request revision)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => act.mutate({ type: "approve", feedbackId: f.id, note: note || undefined })}
                      disabled={act.isPending}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!note.trim()) return toast.error("Add a note explaining what to revise");
                        act.mutate({ type: "request_revision", feedbackId: f.id, note });
                      }}
                      disabled={act.isPending}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Request revision
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (!note.trim()) return toast.error("Add a rejection reason");
                        act.mutate({ type: "reject", feedbackId: f.id, note });
                      }}
                      disabled={act.isPending}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
