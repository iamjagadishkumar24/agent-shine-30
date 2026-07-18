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
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/coaching/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    agent: (s.agent as string) ?? "",
    feedback: (s.feedback as string) ?? "",
  }),
  component: NewSession,
});

const Schema = z.object({
  topic: z.string().trim().min(4, "Topic too short").max(200),
  agent_id: z.string().uuid("Pick an agent"),
  scheduled_at: z.string().min(1, "Pick a date/time"),
  duration_minutes: z.number().int().min(5).max(480),
  notes: z.string().trim().max(2000).optional(),
  feedback_id: z.string().uuid().optional().or(z.literal("")),
});

function NewSession() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { agent, feedback } = Route.useSearch();

  const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
  now.setSeconds(0, 0);
  const defaultDT = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [form, setForm] = useState({
    topic: "",
    agent_id: agent,
    scheduled_at: defaultDT,
    duration_minutes: 30,
    notes: "",
    feedback_id: feedback,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, full_name, department").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const parsed = Schema.parse({ ...form, duration_minutes: Number(form.duration_minutes) });
      const payload: any = {
        topic: parsed.topic,
        agent_id: parsed.agent_id,
        scheduled_at: new Date(parsed.scheduled_at).toISOString(),
        duration_minutes: parsed.duration_minutes,
        notes: parsed.notes || null,
        feedback_id: parsed.feedback_id || null,
      };
      const { data: user } = await supabase.auth.getUser();
      if (user.user) payload.coach_id = user.user.id;
      const { data, error } = await supabase.from("coaching_sessions").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["coaching-sessions"] });
      toast.success("Session scheduled");
      navigate({ to: "/coaching/$id", params: { id: row.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not schedule"),
  });

  return (
    <div>
      <PageHeader title="Schedule coaching session" subtitle="Book time with an agent and capture the plan." />
      <div className="mx-auto max-w-2xl px-8 pb-12 pt-6">
        <Card className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic</Label>
            <Input id="topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Improve escalation handling" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Agent</Label>
              <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pick agent" /></SelectTrigger>
                <SelectContent>
                  {agents.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.full_name} · {a.department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dur">Duration (minutes)</Label>
              <Input id="dur" type="number" min={5} max={480} value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dt">Scheduled at</Label>
            <Input id="dt" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes / agenda</Label>
            <Textarea id="notes" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What will you cover?" />
          </div>

          {form.feedback_id && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Linked to feedback item <span className="font-mono">{form.feedback_id.slice(0, 8)}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/coaching" })}>Cancel</Button>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Scheduling…" : "Schedule session"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
