import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonBox } from "@/components/ui/skeleton-blocks";
import { ArrowLeft, CheckCircle2, MessageCircleQuestion, History } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { acknowledgeFeedback, requestClarification } from "@/lib/agent-portal.functions";

function safeTimeAgo(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true });
}

function safeDate(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : format(d, "PPP");
}


export const Route = createFileRoute("/_authenticated/portal/$id")({
  component: PortalFeedbackDetail,
});

const STATUS_TONE: Record<string, string> = {
  sent: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
  acknowledged: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
  completed: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
};

function PortalFeedbackDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ackNote, setAckNote] = useState("");
  const [clarifyNote, setClarifyNote] = useState("");

  const ackFn = useServerFn(acknowledgeFeedback);
  const clarifyFn = useServerFn(requestClarification);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-feedback", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["portal-feedback-audit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_audit_log")
        .select("*")
        .eq("feedback_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const ackMutation = useMutation({
    mutationFn: async () => ackFn({ data: { feedbackId: id, note: ackNote } }),
    onSuccess: () => {
      toast.success("Feedback acknowledged");
      setAckNote("");
      qc.invalidateQueries({ queryKey: ["portal-feedback", id] });
      qc.invalidateQueries({ queryKey: ["portal-feedback-audit", id] });
      qc.invalidateQueries({ queryKey: ["my-feedback"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clarifyMutation = useMutation({
    mutationFn: async () => clarifyFn({ data: { feedbackId: id, note: clarifyNote } }),
    onSuccess: () => {
      toast.success("Clarification request sent");
      setClarifyNote("");
      qc.invalidateQueries({ queryKey: ["portal-feedback-audit", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Feedback" subtitle="Loading…" />
        <div className="mx-auto max-w-4xl px-8 pb-12 pt-6 space-y-3">
          <SkeletonBox className="h-40 w-full" />
          <SkeletonBox className="h-32 w-full" />
          <SkeletonBox className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-12 text-sm text-muted-foreground">
        Feedback not found.
      </div>
    );
  }

  const isAcked = data.status === "acknowledged" || data.status === "completed";

  return (
    <div>
      <PageHeader
        title={data.title || "Feedback"}
        subtitle={[data.status?.toUpperCase(), data.category, data.feedback_type].filter(Boolean).join(" · ")}

        actions={
          <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/portal" })}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
          </Button>
        }
      />

      <div className="mx-auto max-w-4xl px-8 pb-12 pt-6 space-y-4 animate-in fade-in duration-300">
        {/* Content */}
        <Card className="rounded-xl border-border/60 bg-card/60 p-5 space-y-4">
          {data.score != null && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">QA Score</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">{data.score}</div>
            </div>
          )}
          {data.summary && <Section label="Summary" body={data.summary} />}
          {data.strengths && <Section label="Strengths" body={data.strengths} />}
          {data.improvements && <Section label="Areas to improve" body={data.improvements} />}
          {data.recommended_actions && <Section label="Recommended actions" body={data.recommended_actions} />}
          {data.due_date && safeDate(data.due_date) && (
            <div className="text-xs text-muted-foreground">
              Due by <span className="font-medium text-foreground">{safeDate(data.due_date)}</span>
            </div>
          )}

        </Card>

        {/* Acknowledge */}
        {!isAcked && (
          <Card className="rounded-xl border-border/60 bg-card/60 p-5 space-y-3">
            <div>
              <div className="text-sm font-medium">Acknowledge this feedback</div>
              <div className="text-xs text-muted-foreground">
                Confirm you've read and understood. Your note is visible to your manager and QA.
              </div>
            </div>
            <Textarea
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
              placeholder="I've read this feedback and…"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => ackMutation.mutate()}
                disabled={!ackNote.trim() || ackMutation.isPending}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {ackMutation.isPending ? "Saving…" : "Acknowledge"}
              </Button>
            </div>
          </Card>
        )}

        {isAcked && data.acknowledgement_note && (
          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Your acknowledgement</div>
            <div className="mt-1 whitespace-pre-wrap text-sm">{data.acknowledgement_note}</div>
            {data.acknowledged_at && (
              <div className="mt-2 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(data.acknowledged_at), { addSuffix: true })}
              </div>
            )}
          </Card>
        )}

        {/* Clarification */}
        <Card className="rounded-xl border-border/60 bg-card/60 p-5 space-y-3">
          <div>
            <div className="text-sm font-medium">Need clarification?</div>
            <div className="text-xs text-muted-foreground">
              Send a note to your reviewer. They'll see it in the audit trail.
            </div>
          </div>
          <Textarea
            value={clarifyNote}
            onChange={(e) => setClarifyNote(e.target.value)}
            placeholder="I'd like to understand…"
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => clarifyMutation.mutate()}
              disabled={!clarifyNote.trim() || clarifyMutation.isPending}
            >
              <MessageCircleQuestion className="mr-1.5 h-3.5 w-3.5" />
              {clarifyMutation.isPending ? "Sending…" : "Send question"}
            </Button>
          </div>
        </Card>

        {/* Audit trail */}
        <Card className="rounded-xl border-border/60 bg-card/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <History className="h-3.5 w-3.5" /> History
          </div>
          {audit.length === 0 ? (
            <div className="text-xs text-muted-foreground">No activity yet.</div>
          ) : (
            <ul className="space-y-3">
              {audit.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs">
                      <span className="font-medium capitalize">{e.action.replace(/_/g, " ")}</span>
                      {e.from_status && e.to_status && e.from_status !== e.to_status && (
                        <span className="ml-1 text-muted-foreground">
                          {e.from_status} → {e.to_status}
                        </span>
                      )}
                    </div>
                    {e.comment && (
                      <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{e.comment}</div>
                    )}
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="pt-2 text-center">
          <Link to="/portal" className="text-xs text-muted-foreground hover:text-foreground">
            ← All my feedback
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm">{body}</div>
    </div>
  );
}
