import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching/new")({
  validateSearch: (s: Record<string, unknown>): { agent?: string; feedback?: string; plan?: string } => {
    const out: { agent?: string; feedback?: string; plan?: string } = {};
    if (s.agent) out.agent = String(s.agent);
    if (s.feedback) out.feedback = String(s.feedback);
    if (s.plan) out.plan = String(s.plan);
    return out;
  },
  component: NewSession,
});

const Schema = z.object({
  topic: z.string().trim().min(4, "Topic must be at least 4 characters").max(200, "Topic is too long"),
  agent_id: z.string().uuid("Pick an agent"),
  scheduled_at: z.string().min(1, "Pick a date and time").refine(
    (v) => !Number.isNaN(new Date(v).getTime()),
    "Invalid date",
  ),
  duration_minutes: z.number().int().min(5, "At least 5 minutes").max(480, "Max 8 hours"),
  notes: z.string().trim().max(2000, "Notes too long").optional(),
  feedback_id: z.string().uuid().optional().or(z.literal("")),
  plan_id: z.string().uuid().optional().or(z.literal("")),
});

function NewSession() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { agent = "", feedback = "", plan = "" } = Route.useSearch();

  const nowLocal = useMemo(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);
  const defaultDT = useMemo(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);

  const [form, setForm] = useState({
    topic: "",
    agent_id: agent,
    scheduled_at: defaultDT,
    duration_minutes: 30,
    notes: "",
    feedback_id: feedback,
    plan_id: plan,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, full_name, department").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const parsed = Schema.safeParse({ ...form, duration_minutes: Number(form.duration_minutes) || 0 });
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
    }
  }
  const canSubmit = parsed.success;

  const create = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const data = parsed.data;
      const payload: any = {
        topic: data.topic,
        agent_id: data.agent_id,
        scheduled_at: new Date(data.scheduled_at).toISOString(),
        duration_minutes: data.duration_minutes,
        notes: data.notes || null,
        feedback_id: data.feedback_id || null,
        plan_id: data.plan_id || null,
      };
      const { data: user } = await supabase.auth.getUser();
      if (user.user) payload.coach_id = user.user.id;
      const { data: row, error } = await supabase.from("coaching_sessions").insert(payload).select("id").single();
      if (error) throw error;
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["coaching-sessions"] });
      toast.success("Session scheduled");
      navigate({ to: "/coaching/$id", params: { id: row.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not schedule"),
  });

  return (
    <div>
      <PageHeader title="Schedule coaching session" subtitle="Book time with an agent and capture the plan." />
      <div className="mx-auto max-w-2xl px-8 pb-12 pt-6">
        <Card className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="e.g. Improve escalation handling"
              aria-invalid={!!errors.topic}
              className={cn(errors.topic && "border-destructive/60")}
            />
            {errors.topic && <p className="text-xs text-destructive">{errors.topic}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Agent</Label>
              <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                <SelectTrigger aria-invalid={!!errors.agent_id} className={cn(errors.agent_id && "border-destructive/60")}>
                  <SelectValue placeholder="Pick agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name} · {a.department ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.agent_id && <p className="text-xs text-destructive">{errors.agent_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dur">Duration (minutes)</Label>
              <Input
                id="dur"
                type="number"
                min={5}
                max={480}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                aria-invalid={!!errors.duration_minutes}
                className={cn(errors.duration_minutes && "border-destructive/60")}
              />
              {errors.duration_minutes && <p className="text-xs text-destructive">{errors.duration_minutes}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dt">Scheduled at</Label>
            <Input
              id="dt"
              type="datetime-local"
              min={nowLocal}
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              aria-invalid={!!errors.scheduled_at}
              className={cn(errors.scheduled_at && "border-destructive/60")}
            />
            {errors.scheduled_at && <p className="text-xs text-destructive">{errors.scheduled_at}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes / agenda</Label>
            <Textarea
              id="notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="What will you cover?"
              aria-invalid={!!errors.notes}
            />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes}</p>}
          </div>

          {form.feedback_id && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Linked to feedback item <span className="font-mono">{form.feedback_id.slice(0, 8)}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/coaching" })}>Cancel</Button>
            <Button size="sm" onClick={() => create.mutate()} disabled={!canSubmit || create.isPending}>
              {create.isPending ? "Scheduling…" : "Schedule session"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
