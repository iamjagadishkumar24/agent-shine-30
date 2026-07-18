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

export const Route = createFileRoute("/_authenticated/coaching/plans/new")({
  validateSearch: (s: Record<string, unknown>): { agent?: string } => {
    const out: { agent?: string } = {};
    if (s.agent) out.agent = String(s.agent);
    return out;
  },
  component: NewPlan,
});

const Schema = z
  .object({
    title: z.string().trim().min(4, "Title must be at least 4 characters").max(200),
    agent_id: z.string().uuid("Pick an agent"),
    description: z.string().trim().max(2000).optional(),
    start_date: z.string().min(1, "Start date is required"),
    target_date: z.string().optional().or(z.literal("")),
  })
  .refine(
    (v) => !v.target_date || v.target_date >= v.start_date,
    { path: ["target_date"], message: "Target date must be on or after the start date" },
  );

function NewPlan() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { agent = "" } = Route.useSearch();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    title: "",
    agent_id: agent,
    description: "",
    start_date: today,
    target_date: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      const parsed = Schema.parse(form);
      const { data: user } = await supabase.auth.getUser();
      const payload: any = {
        title: parsed.title,
        agent_id: parsed.agent_id,
        description: parsed.description || null,
        start_date: parsed.start_date,
        target_date: parsed.target_date || null,
        coach_id: user.user?.id ?? null,
      };
      const { data, error } = await supabase.from("coaching_plans").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["coaching-plans"] });
      toast.success("Plan created");
      navigate({ to: "/coaching/plans/$id", params: { id: row.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not create plan"),
  });

  const submit = () => {
    const result = Schema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      toast.error(result.error.issues[0]?.message ?? "Please fix the highlighted fields");
      return;
    }
    setErrors({});
    create.mutate();
  };

  const canSubmit =
    form.title.trim().length >= 4 &&
    !!form.agent_id &&
    !!form.start_date &&
    (!form.target_date || form.target_date >= form.start_date);

  return (
    <div>
      <PageHeader title="New coaching plan" subtitle="Set a development plan with measurable goals and dates." />
      <div className="mx-auto max-w-2xl px-8 pb-12 pt-6">
        <Card className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Plan title</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Q4 CSAT improvement" />
          </div>

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
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Focus areas, context, expected outcome…" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="start">Start date</Label>
              <Input id="start" type="date" value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target">Target date</Label>
              <Input id="target" type="date" value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/coaching/plans" })}>Cancel</Button>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create plan"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
