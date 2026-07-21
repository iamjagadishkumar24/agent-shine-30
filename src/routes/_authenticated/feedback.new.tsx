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

import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Loader2, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { generateFeedbackDraft, EMAIL_TEMPLATES, type EmailTemplate } from "@/lib/ai-feedback.functions";
import { getActiveScorecard, saveFeedbackWithScores } from "@/lib/scorecard.functions";
import { computeOverall, labelTone } from "@/lib/scorecard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/feedback/new")({
  validateSearch: (s: Record<string, unknown>): { agent?: string } =>
    s.agent ? { agent: String(s.agent) } : {},
  component: NewFeedback,
});

const CATEGORIES = ["Communication", "Compliance", "Behavior", "Soft Skills", "Documentation", "Process", "Customer Experience", "Knowledge", "Ownership"];

const HeaderSchema = z.object({
  title: z.string().trim().min(4, "Title too short").max(200),
  agent_id: z.string().uuid("Pick an agent"),
  category: z.string().min(1),
  feedback_type: z.enum(["positive", "constructive", "critical", "compliance", "coaching"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  interaction_type: z.enum(["chat", "case"]),
  interaction_reference: z.string().max(200).optional(),
  interaction_date: z.string().min(1, "Pick a date"),
});

type ScoreState = {
  parameter_name: string;
  max_points: number;
  points: number; // 0..max_points
};

function NewFeedback() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { agent = "" } = Route.useSearch();

  const getScorecardFn = useServerFn(getActiveScorecard);
  const scorecard = useQuery({
    queryKey: ["active-scorecard"],
    queryFn: () => getScorecardFn(),
    staleTime: 60_000,
  });

  const [form, setForm] = useState({
    title: "",
    agent_id: agent,
    category: "Communication",
    feedback_type: "constructive" as const,
    severity: "medium" as const,
    interaction_type: "chat" as const,
    interaction_reference: "",
    interaction_date: new Date().toISOString().slice(0, 10),
    tags: "",
    summary: "",
    strengths: "",
    improvements: "",
  });

  const [scores, setScores] = useState<ScoreState[]>([]);

  // Initialize scores when scorecard loads
  useMemo(() => {
    if (scorecard.data?.parameters?.length && scores.length === 0) {
      setScores(
        scorecard.data.parameters.map((p) => ({
          parameter_name: p.name,
          max_points: Number(p.max_points),
          points: 0,
        })),
      );
    }
  }, [scorecard.data, scores.length]);

  const overall = useMemo(
    () =>
      computeOverall(
        scores.map((s) => ({
          max_points: s.max_points,
          selected_percentage: s.max_points > 0 ? (s.points / s.max_points) * 100 : 0,
        })),
      ),
    [scores],
  );

  const [aiOpen, setAiOpen] = useState(false);
  const [observations, setObservations] = useState("");
  const [template, setTemplate] = useState<EmailTemplate>("performance_feedback");
  const [lastDraft, setLastDraft] = useState<null | { title: string; summary: string; strengths: string; improvements: string }>(null);
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
          score: overall.percentage || null,
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
      }));
      setAiOpen(false);
    },
    onError: () => toast.error("Unable to generate AI draft. Please try again."),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, full_name, employee_id, department, team_id").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const selectedAgent = agents.find((a) => a.id === form.agent_id);

  const header = HeaderSchema.safeParse(form);
  const fieldErrors: Record<string, string> = {};
  if (!header.success) {
    for (const issue of header.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
  }

  const scoresValid = scores.length > 0 && Math.abs(overall.max - 100) < 0.01;
  const canSubmit = header.success && scoresValid;

  const saveFn = useServerFn(saveFeedbackWithScores);
  const save = useMutation({
    mutationFn: async (mode: "draft" | "send" | "submit") => {
      if (mode !== "draft" && !canSubmit) {
        throw new Error(
          !header.success
            ? header.error.issues[0]?.message ?? "Please fix the highlighted fields"
            : "Scorecard weights must total 100",
        );
      }
      return await saveFn({
        data: {
          title: form.title,
          agent_id: form.agent_id,
          category: form.category,
          feedback_type: form.feedback_type,
          severity: form.severity,
          interaction_type: form.interaction_type,
          interaction_reference: form.interaction_reference || null,
          interaction_date: form.interaction_date,
          team_id: selectedAgent?.team_id ?? null,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          summary: form.summary || null,
          strengths: form.strengths || null,
          improvements: form.improvements || null,
          recommended_actions: null,
          internal_notes: null,
          agent_visible_notes: null,
          scores: scores.map((s) => ({
            parameter_name: s.parameter_name,
            max_points: s.max_points,
            selected_percentage: s.max_points > 0 ? (s.points / s.max_points) * 100 : 0,
            evaluator_note: null,
          })),
          mode,
        },
      });
    },
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["feedback-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/feedback/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const updateScore = (idx: number, patch: Partial<ScoreState>) => {
    setScores((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <div>
      <PageHeader
        title="New feedback"
        subtitle="Score seven quality parameters, add written feedback, and save or send."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAiOpen(true)} disabled={save.isPending}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => save.mutate("draft")} disabled={save.isPending || !form.title.trim() || !form.agent_id}>
              Save draft
            </Button>
            <Button size="sm" onClick={() => save.mutate("send")} disabled={save.isPending || !canSubmit} title={!canSubmit ? "Complete the form and score all parameters to send" : undefined}>
              {save.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending…</> : "Submit & send email"}
            </Button>
          </div>
        }
      />
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-8">
        {/* Interaction details */}
        <Card className="rounded-xl border-border/60 bg-card/60 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Interaction</h2>
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
              <Label>Interaction Type</Label>
              <Select value={form.interaction_type} onValueChange={(v: any) => setForm({ ...form, interaction_type: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="case">Case</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Interaction Reference</Label>
              <Input className="mt-1.5" value={form.interaction_reference} onChange={(e) => setForm({ ...form, interaction_reference: e.target.value })} placeholder="Case ID / chat ID" />
            </div>
            <div>
              <Label>Interaction Date</Label>
              <Input type="date" className="mt-1.5" value={form.interaction_date} onChange={(e) => setForm({ ...form, interaction_date: e.target.value })} />
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
              <Label>Tags (comma separated)</Label>
              <Input className="mt-1.5" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. VIP, refund, escalation" />
            </div>
          </div>
        </Card>

        {/* Quality Evaluation */}
        <Card className="mt-6 rounded-xl border-border/60 bg-card/60 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quality Evaluation</h2>
              <p className="mt-1 text-xs text-muted-foreground">Score each parameter 0–100%. Points are weighted by parameter.</p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Overall Score</div>
              <div className="text-2xl font-bold tabular-nums">
                {overall.earned.toFixed(2)}<span className="text-base font-normal text-muted-foreground"> / {overall.max}</span>
              </div>
              <div className={cn("text-sm font-semibold", labelTone(overall.label))}>
                {overall.percentage.toFixed(2)}% · {overall.label ?? "—"}
              </div>
            </div>
          </div>
          <Progress value={overall.percentage} className="h-2" />

          {scorecard.isLoading ? (
            <div className="mt-6 flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading scorecard…
            </div>
          ) : scores.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              No active scorecard configured. An admin must set one up in Settings.
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              {scores.map((s, idx) => {
                const earned = computeEarnedPoints(s.max_points, s.selected_percentage);
                return (
                  <div key={s.parameter_name} className="rounded-lg border border-border/60 bg-background/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{s.parameter_name}</div>
                        <div className="text-xs text-muted-foreground">Max {s.max_points} pts</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={s.selected_percentage}
                          onChange={(e) => updateScore(idx, { selected_percentage: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                          className="h-8 w-20 text-right tabular-nums"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <div className="w-24 rounded-md bg-muted px-2 py-1 text-right text-sm font-semibold tabular-nums">
                          {earned.toFixed(2)} pts
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Slider
                        value={[s.selected_percentage]}
                        onValueChange={([v]) => updateScore(idx, { selected_percentage: v })}
                        max={100}
                        step={1}
                      />
                    </div>
                    <Textarea
                      className="mt-3 resize-none"
                      rows={2}
                      value={s.evaluator_note}
                      onChange={(e) => updateScore(idx, { evaluator_note: e.target.value })}
                      placeholder="Optional evaluator note for this parameter"
                    />
                  </div>
                );
              })}
              {!scoresValid && (
                <p className="text-xs text-destructive">
                  Active scorecard weights must total 100 (currently {overall.max}). Ask an admin to fix Settings.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Written Feedback */}
        <Card className="mt-6 rounded-xl border-border/60 bg-card/60 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Written Feedback</h2>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div>
              <Label>Internal notes (not shared with agent)</Label>
              <Textarea className="mt-1.5" rows={3} value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} placeholder="For QA/manager eyes only" />
            </div>
            <div>
              <Label>Agent-visible notes</Label>
              <Textarea className="mt-1.5" rows={3} value={form.agent_visible_notes} onChange={(e) => setForm({ ...form, agent_visible_notes: e.target.value })} placeholder="Included in the email" />
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI feedback draft</DialogTitle>
            <DialogDescription>
              Paste raw observations from your review. The AI grounds strengths on your highest scores and improvements on your lowest.
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
                placeholder="e.g. On the 10:42 billing call, agent skipped mini-Miranda, resolved in under 3 minutes, but interrupted the customer twice..."
              />
              <p className="mt-1 text-xs text-muted-foreground">Overall score: {overall.percentage.toFixed(1)}% · uses agent, category, type, severity from the form above.</p>
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
