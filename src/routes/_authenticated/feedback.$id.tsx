import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/feedback/$id")({
  component: FeedbackDetail,
});

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
  approved: "bg-primary/15 text-primary",
  sent: "bg-primary/15 text-primary",
  acknowledged: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
  completed: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
};

function FeedbackDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ackNote, setAckNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["feedback", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*, agent:agents(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("feedback").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback", id] });
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      navigate({ to: "/feedback" });
    },
  });

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const send = () => update.mutate({ status: "sent", sent_at: new Date().toISOString() }, { onSuccess: () => toast.success("Feedback sent") });
  const acknowledge = () => update.mutate({ status: "acknowledged", acknowledged_at: new Date().toISOString(), acknowledgement_note: ackNote }, { onSuccess: () => toast.success("Acknowledged") });
  const complete = () => update.mutate({ status: "completed" }, { onSuccess: () => toast.success("Marked complete") });

  return (
    <div>
      <PageHeader
        title={data.title}
        subtitle={`${data.agent?.full_name ?? ""} · ${data.category}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/feedback"><ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back</Link></Button>
            {data.status === "draft" && <Button size="sm" onClick={send}><Send className="mr-1.5 h-3.5 w-3.5" /> Send</Button>}
            {data.status === "acknowledged" && <Button size="sm" variant="outline" onClick={complete}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Complete</Button>}
            <Button variant="ghost" size="icon" onClick={() => remove.mutate()} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        }
      />
      <div className="mx-auto grid max-w-6xl gap-4 px-8 pb-16 pt-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card className="rounded-xl border-border/60 bg-card/60 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium capitalize", STATUS_TONE[data.status])}>{data.status}</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize">{data.feedback_type}</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize">Severity: {data.severity}</span>
              {data.score != null && <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary tabular-nums">Score {Number(data.score).toFixed(1)}</span>}
            </div>
            <Section title="Summary" body={data.summary} />
            <Section title="Strengths" body={data.strengths} />
            <Section title="Areas to improve" body={data.improvements} />
            <Section title="Recommended actions" body={data.recommended_actions} />
          </Card>

          {data.status === "sent" && (
            <Card className="rounded-xl border-border/60 bg-card/60 p-6">
              <div className="text-sm font-medium">Acknowledge feedback</div>
              <div className="mt-1 text-xs text-muted-foreground">Confirm you've read this feedback and add a short note.</div>
              <Textarea className="mt-3" rows={3} value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="I've read and understood…" />
              <Button size="sm" className="mt-3" onClick={acknowledge}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Acknowledge</Button>
            </Card>
          )}

          {data.acknowledgement_note && (
            <Card className="rounded-xl border-border/60 bg-card/60 p-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent acknowledgement</div>
              <p className="mt-2 text-sm">{data.acknowledgement_note}</p>
              {data.acknowledged_at && <div className="mt-2 text-xs text-muted-foreground">Acknowledged {formatDistanceToNow(new Date(data.acknowledged_at), { addSuffix: true })}</div>}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent</div>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-sm font-medium text-primary">
                {data.agent?.full_name?.split(" ").map((s: string) => s[0]).slice(0, 2).join("")}
              </div>
              <div>
                <div className="text-sm font-medium">{data.agent?.full_name}</div>
                <div className="text-xs text-muted-foreground">{data.agent?.employee_id} · {data.agent?.department}</div>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <Row k="Team" v={data.agent?.team ?? "—"} />
              <Row k="Manager" v={data.agent?.manager_name ?? "—"} />
              <Row k="QA Score" v={Number(data.agent?.qa_score ?? 0).toFixed(1)} />
            </dl>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</div>
            <ul className="mt-3 space-y-3 text-xs">
              <li><span className="text-muted-foreground">Created</span> · {formatDistanceToNow(new Date(data.created_at), { addSuffix: true })}</li>
              {data.sent_at && <li><span className="text-muted-foreground">Sent</span> · {formatDistanceToNow(new Date(data.sent_at), { addSuffix: true })}</li>}
              {data.acknowledged_at && <li><span className="text-muted-foreground">Acknowledged</span> · {formatDistanceToNow(new Date(data.acknowledged_at), { addSuffix: true })}</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <div className="mt-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
