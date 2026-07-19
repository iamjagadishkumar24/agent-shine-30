import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Loader2, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { generateFeedbackDraft, EMAIL_TEMPLATES, type EmailTemplate } from "@/lib/ai-feedback.functions";
import { sendFeedbackEmail } from "@/lib/feedback-email.functions";

export const Route = createFileRoute("/_authenticated/feedback/new")({
  validateSearch: (s: Record<string, unknown>): { agent?: string } =>
    s.agent ? { agent: String(s.agent) } : {},
  component: NewFeedback,
});

const CATEGORIES = ["Communication", "Compliance", "Behavior", "Soft Skills", "Documentation", "Process", "Customer Experience", "Knowledge", "Ownership"];

const Schema = z.object({
  title: z.string().trim().min(4, "Title too short").max(200),
  agent_id: z.string().uuid("Pick an agent"),
  category: z.string().min(1),
  feedback_type: z.enum(["positive", "constructive", "critical", "compliance", "coaching"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string().trim().max(2000).optional(),
  strengths: z.string().trim().max(2000).optional(),
  improvements: z.string().trim().max(2000).optional(),
  recommended_actions: z.string().trim().max(2000).optional(),
  score: z.number().min(0).max(100).optional(),
});

function NewFeedback() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { agent = "" } = Route.useSearch();
  const [form, setForm] = useState({
    title: "", agent_id: agent, category: "Communication",
    feedback_type: "constructive" as const, severity: "medium" as const,
    summary: "", strengths: "", improvements: "", recommended_actions: "", score: "",
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [observations, setObservations] = useState("");
  const [template, setTemplate] = useState<EmailTemplate>("performance_feedback");
  const [lastDraft, setLastDraft] = useState<null | { title: string; summary: string; strengths: string; improvements: string; recommended_actions: string }>(null);
  const runAi = useServerFn(generateFeedbackDraft);
  const ai = useMutation({
    mutationFn: async () => {
      if (!form.agent_id) throw new Error("Pick an agent first");
      if (observations.trim().length < 10) throw new Error("Add at least a sentence of observations");
      return await runAi({
        data: {
          agent_id: form.agent_id,
          category: form.category,
          feedback_type: form.feedback_type,
          severity: form.severity,
          observations: observations.trim(),
          score: form.score ? Number(form.score) : null,
          template,
        },
      });
    },
    onSuccess: (draft) => {
      setLastDraft(draft);
      setForm((f) => ({
        ...f,
        title: draft.title || f.title,
        summary: draft.summary || f.summary,
        strengths: draft.strengths || f.strengths,
        improvements: draft.improvements || f.improvements,
        recommended_actions: draft.recommended_actions || f.recommended_actions,
      }));
      setAiOpen(false);
      toast.success("AI draft applied — review before sending");
    },
    onError: (e: any) => toast.error(e.message ?? "AI draft failed"),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, full_name, employee_id, department").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const parsed = Schema.safeParse({
    ...form,
    score: form.score ? Number(form.score) : undefined,
  });
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
  }
  const canSubmit = parsed.success;

  const sendEmailFn = useServerFn(sendFeedbackEmail);

  const create = useMutation({
    mutationFn: async (mode: "draft" | "send") => {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Please fix the highlighted fields");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      // Insert first; for "send" we insert as approved so the email pipeline
      // can transition approved → queued → sent based on the real provider response.
      const payload = {
        ...parsed.data,
        status: (mode === "send" ? "approved" : "draft") as "approved" | "draft",
        sent_at: null,
        created_by: userData.user.id,
      };
      const { data: row, error } = await supabase.from("feedback").insert(payload).select("id").single();
      if (error) throw error;
      if (mode === "draft") return { id: row.id, mode, sendResult: null as any };
      // Kick off the real send. Response reflects provider acceptance.
      const sendResult = await sendEmailFn({ data: { feedbackId: row.id } });
      return { id: row.id, mode, sendResult };
    },
    onSuccess: ({ id, mode, sendResult }) => {
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      if (mode === "draft") {
        toast.success("Draft saved");
      } else if (sendResult?.ok) {
        const r = sendResult as { actualRecipient?: string; devOverride?: boolean };
        const dest = r.devOverride ? `Dev override active — delivered to ${r.actualRecipient}` : `Delivered to ${r.actualRecipient}`;
        toast.success(`Email accepted by provider · ${dest}`);
      } else {
        toast.warning(sendResult?.error ? `Queued (provider not accepted): ${sendResult.error}` : "Queued for background retry");
      }
      navigate({ to: "/feedback/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });


  return (
    <div>
      <PageHeader
        title="New feedback"
        subtitle="Craft feedback with clear structure. Save as draft or send immediately."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAiOpen(true)} disabled={create.isPending}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => create.mutate("draft")} disabled={create.isPending || !form.title.trim() || !form.agent_id}>Save draft</Button>
            <Button size="sm" onClick={() => create.mutate("send")} disabled={create.isPending || !canSubmit} title={!canSubmit ? "Complete the required fields to send" : undefined}>
              {create.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending…</> : "Send now"}
            </Button>
          </div>
        }
      />
      <div className="mx-auto max-w-4xl px-8 pb-16 pt-6">
        <Card className="rounded-xl border-border/60 bg-card/60 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input className="mt-1.5" aria-invalid={!!fieldErrors.title} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Missed disclosure on billing call" />
              {fieldErrors.title && <p className="mt-1 text-xs text-destructive">{fieldErrors.title}</p>}
            </div>
            <div>
              <Label>Agent</Label>
              <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                <SelectTrigger className="mt-1.5" aria-invalid={!!fieldErrors.agent_id}><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name} · {a.department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.agent_id && <p className="mt-1 text-xs text-destructive">{fieldErrors.agent_id}</p>}
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.feedback_type} onValueChange={(v: any) => setForm({ ...form, feedback_type: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["positive", "constructive", "critical", "compliance", "coaching"].map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={(v: any) => setForm({ ...form, severity: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Score (0-100)</Label>
              <Input type="number" min={0} max={100} className="mt-1.5" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} placeholder="Optional quality score" />
            </div>
            <div className="sm:col-span-2">
              <Label>Summary</Label>
              <Textarea className="mt-1.5" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What happened, in one paragraph." />
            </div>
            <div>
              <Label>Strengths</Label>
              <Textarea className="mt-1.5" rows={4} value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} placeholder="What went well" />
            </div>
            <div>
              <Label>Areas to improve</Label>
              <Textarea className="mt-1.5" rows={4} value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} placeholder="Where to grow" />
            </div>
            <div className="sm:col-span-2">
              <Label>Recommended actions</Label>
              <Textarea className="mt-1.5" rows={3} value={form.recommended_actions} onChange={(e) => setForm({ ...form, recommended_actions: e.target.value })} placeholder="Concrete next steps, coaching, learning material" />
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI feedback draft</DialogTitle>
            <DialogDescription>
              Paste raw observations from your review. The AI will structure it into a professional draft you can edit before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as EmailTemplate)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMAIL_TEMPLATES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observations</Label>
              <Textarea
                rows={8}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="e.g. On the 10:42 billing call, agent skipped mini-Miranda, resolved the dispute in under 3 minutes, but interrupted the customer twice..."
              />
              <p className="mt-1 text-xs text-muted-foreground">Uses agent, category, type, severity, and score from the form above.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAiOpen(false)} disabled={ai.isPending}>Cancel</Button>
            {lastDraft ? (
              <Button variant="secondary" onClick={() => ai.mutate()} disabled={ai.isPending}>
                {ai.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Regenerating…</> : <><RotateCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate</>}
              </Button>
            ) : null}
            <Button onClick={() => ai.mutate()} disabled={ai.isPending}>
              {ai.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Generate draft</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
