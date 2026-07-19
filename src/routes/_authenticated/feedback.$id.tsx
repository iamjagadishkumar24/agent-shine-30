import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, CheckCircle2, Trash2, Mail, MailOpen, MousePointerClick, AlertTriangle, Paperclip, Upload, X, CalendarPlus, GitPullRequest, ThumbsUp, ThumbsDown, RotateCcw, History, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { sendFeedbackEmail, previewFeedbackEmail, sendFeedbackTestEmail } from "@/lib/feedback-email.functions";
import { createUploadUrl, deleteAttachment } from "@/lib/feedback-attachments.functions";
import { transitionFeedback } from "@/lib/feedback-workflow.functions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

function safeTimeAgo(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : formatDistanceToNow(d, { addSuffix: true });
}

export const Route = createFileRoute("/_authenticated/feedback/$id")({
  component: FeedbackDetail,
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

function FeedbackDetail() {
  const { id } = Route.useParams();
  useRealtimeInvalidate("feedback", [["feedback", id]], { filter: `id=eq.${id}` });
  useRealtimeInvalidate("feedback_audit_log", [["feedback", id]], { filter: `feedback_id=eq.${id}` });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [ackNote, setAckNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<null | {
    ok: boolean;
    provider: string;
    recipient: string;
    latencyMs: number;
    messageId?: string;
    error?: string;
  }>(null);

  const sendEmailFn = useServerFn(sendFeedbackEmail);
  const previewFn = useServerFn(previewFeedbackEmail);
  const testSendFn = useServerFn(sendFeedbackTestEmail);
  const uploadUrlFn = useServerFn(createUploadUrl);
  const deleteAttFn = useServerFn(deleteAttachment);
  const transitionFn = useServerFn(transitionFeedback);

  const preview = useQuery({
    queryKey: ["feedback-preview", id],
    queryFn: () => previewFn({ data: { feedbackId: id } }),
    enabled: previewOpen,
    staleTime: 0,
  });

  const testSend = useMutation({
    mutationFn: async (to: string) => testSendFn({ data: { feedbackId: id, to } }),
    onSuccess: (r) => {
      setTestResult({
        ok: r.ok,
        provider: r.provider,
        recipient: r.recipient,
        latencyMs: r.latencyMs,
        messageId: "messageId" in r ? r.messageId : undefined,
        error: "error" in r ? r.error : undefined,
      });
      if (r.ok) toast.success(`Test delivered to ${r.recipient} (${r.latencyMs}ms)`);
      else toast.error(`Test failed: ${"error" in r ? r.error : "unknown"}`);
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Test send failed";
      setTestResult({ ok: false, provider: "unknown", recipient: testTo, latencyMs: 0, error: msg });
      toast.error(msg);
    },
  });

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

  const { data: attachments = [] } = useQuery({
    queryKey: ["feedback-attachments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_attachments")
        .select("*")
        .eq("feedback_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["feedback-events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_email_events")
        .select("*")
        .eq("feedback_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: import("@/integrations/supabase/types").TablesUpdate<"feedback">) => {
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
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  // Delete confirmation is handled by AlertDialog (see actions area).


  const sendMutation = useMutation({
    mutationFn: () => sendEmailFn({ data: { feedbackId: id } }),
    onSuccess: (res: any) => {
      if (res?.ok) {
        toast.success(
          res.providerMessageId
            ? `Delivered to ${res.recipient} · id ${String(res.providerMessageId).slice(0, 12)}…`
            : `Delivered to ${res.recipient}`,
        );
      } else if (res?.queued) {
        toast.warning(
          `Not delivered yet — queued for retry${res.error ? `: ${res.error}` : ""}`,
        );
      } else {
        toast.error(`Send failed: ${res?.error ?? "unknown"}`);
      }
      qc.invalidateQueries({ queryKey: ["feedback", id] });
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["feedback-events", id] });
      qc.invalidateQueries({ queryKey: ["email-queue"] });
      qc.invalidateQueries({ queryKey: ["email-queue-summary"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const transitionMutation = useMutation({
    mutationFn: (payload: Parameters<typeof transitionFn>[0]["data"]) =>
      transitionFn({ data: payload }),
    onSuccess: (_, vars) => {
      const label =
        vars.type === "submit"
          ? "Submitted for review"
          : vars.type === "approve"
            ? "Approved"
            : vars.type === "reject"
              ? "Rejected"
              : "Revision requested";
      toast.success(label);
      setReviewNote("");
      qc.invalidateQueries({ queryKey: ["feedback", id] });
      qc.invalidateQueries({ queryKey: ["feedback-audit", id] });
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["approval-queue"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["feedback-audit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_audit_log")
        .select("*")
        .eq("feedback_id", id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  const uploadFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Max file size is 20 MB");
      return;
    }
    setUploading(true);
    try {
      const info: any = await uploadUrlFn({
        data: { feedbackId: id, fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size },
      });
      const { error } = await supabase.storage
        .from("feedback-attachments")
        .uploadToSignedUrl(info.path, info.token, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw error;
      toast.success(`Uploaded ${file.name}`);
      qc.invalidateQueries({ queryKey: ["feedback-attachments", id] });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };



  const removeAttachment = useMutation({
    mutationFn: (attId: string) => deleteAttFn({ data: { id: attId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback-attachments", id] }),
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-8 pt-8 space-y-4">
        <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-48 rounded-md bg-muted animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-40 rounded-xl border border-border/60 bg-card/40 animate-pulse" />
            <div className="h-40 rounded-xl border border-border/60 bg-card/40 animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-32 rounded-xl border border-border/60 bg-card/40 animate-pulse" />
            <div className="h-32 rounded-xl border border-border/60 bg-card/40 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }


  const send = () => sendMutation.mutate();
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
            {(data.status === "draft" || data.status === "revision_required") && (
              <Button
                size="sm"
                onClick={() => transitionMutation.mutate({ type: "submit", feedbackId: id })}
                disabled={transitionMutation.isPending}
              >
                <GitPullRequest className="mr-1.5 h-3.5 w-3.5" /> Submit for review
              </Button>
            )}
            {data.status === "approved" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview email
                </Button>
                <Button size="sm" onClick={send} disabled={sendMutation.isPending}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Send
                </Button>
              </>
            )}
            {data.status === "acknowledged" && (
              <Button size="sm" variant="outline" onClick={complete}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Complete
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" disabled={remove.isPending} className="text-muted-foreground hover:text-destructive" aria-label="Delete feedback"><Trash2 className="h-3.5 w-3.5" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this feedback?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{data.title}" will be permanently removed along with its email history. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

          {data.status === "review" && (
            <Card className="rounded-xl border-border/60 bg-card/60 p-6">
              <div className="text-sm font-medium">Review this feedback</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Approve to unlock sending, request revision to send it back to the author, or reject.
              </div>
              <Textarea
                rows={3}
                className="mt-3"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Reviewer note (required for reject / request revision)"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    transitionMutation.mutate({ type: "approve", feedbackId: id, note: reviewNote || undefined })
                  }
                  disabled={transitionMutation.isPending}
                >
                  <ThumbsUp className="mr-1.5 h-3.5 w-3.5" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!reviewNote.trim()) return toast.error("Add a note explaining what to revise");
                    transitionMutation.mutate({ type: "request_revision", feedbackId: id, note: reviewNote });
                  }}
                  disabled={transitionMutation.isPending}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Request revision
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (!reviewNote.trim()) return toast.error("Add a rejection reason");
                    transitionMutation.mutate({ type: "reject", feedbackId: id, note: reviewNote });
                  }}
                  disabled={transitionMutation.isPending}
                >
                  <ThumbsDown className="mr-1.5 h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            </Card>
          )}

          {(data.status === "rejected" || data.status === "revision_required" || data.status === "approved") &&
            data.review_note && (
              <Card className="rounded-xl border-border/60 bg-card/60 p-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Reviewer note
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{data.review_note}</p>
                {data.reviewed_at && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {(safeTimeAgo(data.reviewed_at) ?? "—")}
                  </div>
                )}
              </Card>
            )}


          <Card className="rounded-xl border-border/60 bg-card/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Attachments</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Files are attached to outbound emails.</div>
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload"}
                </Button>
              </div>
            </div>
            {attachments.length > 0 && (
              <ul className="mt-4 space-y-2">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{a.file_name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{Math.round((a.size_bytes ?? 0) / 1024)} KB</span>
                    <Button size="sm" variant="ghost" onClick={() => removeAttachment.mutate(a.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
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
              {data.acknowledged_at && <div className="mt-2 text-xs text-muted-foreground">Acknowledged {(safeTimeAgo(data.acknowledged_at) ?? "—")}</div>}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent</div>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-sm font-medium text-primary">
                {(data.agent?.full_name ?? "?").split(" ").filter(Boolean).map((s: string) => s[0]).slice(0, 2).join("").toUpperCase() || "?"}
              </div>
              <div>
                <div className="text-sm font-medium">{data.agent?.full_name ?? "Unassigned"}</div>
                <div className="text-xs text-muted-foreground">{data.agent?.employee_id ?? "—"} · {data.agent?.department ?? "—"}</div>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <Row k="Team" v={data.agent?.team ?? "—"} />
              <Row k="Manager" v={data.agent?.manager_name ?? "—"} />
              <Row k="Quality Score" v={data.agent?.qa_score == null ? "—" : Number(data.agent.qa_score).toFixed(1)} />
            </dl>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email delivery</div>
            <ul className="mt-3 space-y-2.5 text-xs">
              <DeliveryRow icon={<Mail className="h-3.5 w-3.5" />} label="Sent" at={data.sent_at} />
              <DeliveryRow icon={<Mail className="h-3.5 w-3.5" />} label="Delivered" at={data.delivered_at} />
              <DeliveryRow icon={<MailOpen className="h-3.5 w-3.5" />} label="Opened" at={data.first_opened_at} extra={data.open_count ? `${data.open_count}×` : undefined} />
              <DeliveryRow icon={<MousePointerClick className="h-3.5 w-3.5" />} label="Clicked" at={data.clicked_at} extra={data.click_count ? `${data.click_count}×` : undefined} />
              <DeliveryRow icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Acknowledged" at={data.acknowledged_at} />
              {(data.reminder_count ?? 0) > 0 && (
                <li className="flex items-center gap-2 text-[oklch(0.78_0.16_75)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Escalation reminder sent {data.reminder_count}× {data.last_reminder_at ? `· ${(safeTimeAgo(data.last_reminder_at) ?? "—")}` : ""}</span>
                </li>
              )}
              {data.email_error && (
                <li className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="break-all">{data.email_error}</span>
                </li>
              )}
            </ul>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Coaching</div>
            <Link to="/coaching/new" search={{ agent: data.agent?.id ?? "", feedback: data.id }}>
              <Button variant="outline" size="sm" className="mt-3 w-full gap-1.5">
                <CalendarPlus className="h-3.5 w-3.5" /> Schedule coaching session
              </Button>
            </Link>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</div>
            <ul className="mt-3 space-y-2 text-xs">
              {(events as any[]).map((e) => (
                <li key={e.id} className="flex items-center justify-between">
                  <span className="capitalize">{String(e.event_type).replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{(safeTimeAgo(e.created_at) ?? "—")}</span>
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-muted-foreground">
                  Created {(safeTimeAgo(data.created_at) ?? "—")}
                </li>
              )}
            </ul>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card/60 p-5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <History className="h-3 w-3" /> Audit log
            </div>
            <ul className="mt-3 space-y-2.5 text-xs">
              {(auditLog as any[]).length === 0 && (
                <li className="text-muted-foreground">No workflow activity yet.</li>
              )}
              {(auditLog as any[]).map((a) => (
                <li key={a.id} className="border-l border-border/60 pl-2.5">
                  <div className="capitalize text-foreground">
                    {String(a.action).replace(/_/g, " ")}
                    {a.from_status && a.to_status && (
                      <span className="ml-1 text-muted-foreground">
                        · {a.from_status} → {a.to_status}
                      </span>
                    )}
                  </div>
                  {a.comment && <div className="mt-0.5 text-muted-foreground whitespace-pre-wrap">{a.comment}</div>}
                  <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                    {(safeTimeAgo(a.created_at) ?? "—")}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
            <DialogDescription>
              {preview.data?.recipient ? `Will be delivered to ${preview.data.recipient}` : "Preview of the rendered feedback email."}
              {preview.data?.subject ? ` · Subject: ${preview.data.subject}` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[70vh] overflow-hidden rounded-lg border border-border/60 bg-white">
            {preview.isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Rendering…</div>
            ) : preview.isError ? (
              <div className="flex h-full items-center justify-center text-sm text-destructive">Failed to render preview</div>
            ) : (
              <iframe
                title="Email preview"
                srcDoc={preview.data?.html ?? ""}
                sandbox=""
                className="h-full w-full"
              />
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Send test email</div>
                <p className="text-xs text-muted-foreground">
                  Sends this exact rendered email to any address (subject prefixed <code>[TEST]</code>). Does not change feedback state.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="test.recipient@example.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={() => testSend.mutate(testTo.trim())}
                disabled={testSend.isPending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim())}
              >
                {testSend.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
                Send test
              </Button>
            </div>
            {testResult && (
              <div
                className={`rounded-md border p-2 text-xs ${
                  testResult.ok
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                <div className="font-semibold">
                  {testResult.ok ? "✓ Provider accepted" : "✗ Provider rejected"} · {testResult.provider} · {testResult.latencyMs}ms
                </div>
                <div className="mt-1 space-y-0.5 text-[11px] opacity-90">
                  <div>Recipient: <span className="font-mono">{testResult.recipient}</span></div>
                  {testResult.messageId && <div>Message id: <span className="font-mono break-all">{testResult.messageId}</span></div>}
                  {testResult.error && <div>Error: <span className="font-mono break-all">{testResult.error}</span></div>}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            {data?.status === "approved" && (
              <Button
                onClick={() => {
                  setPreviewOpen(false);
                  send();
                }}
                disabled={sendMutation.isPending}
              >
                <Send className="mr-1.5 h-3.5 w-3.5" /> Send to agent
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
function DeliveryRow({ icon, label, at, extra }: { icon: React.ReactNode; label: string; at?: string | null; extra?: string }) {
  const pending = !at;
  return (
    <li className={cn("flex items-center gap-2", pending ? "text-muted-foreground/70" : "text-foreground")}>
      <span className={cn("grid h-5 w-5 place-items-center rounded-full", pending ? "bg-muted" : "bg-primary/15 text-primary")}>{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        {at ? (safeTimeAgo(at) ?? "—") : "—"}
        {extra ? ` · ${extra}` : ""}
      </span>
    </li>
  );
}
