import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Target, TrendingUp, Trash2, CheckCircle2, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

const safeDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};
const safeDateTime = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
};

export const Route = createFileRoute("/_authenticated/coaching/plans/$id")({
  component: PlanDetail,
});

const GOAL_STATUS: Record<string, string> = {
  on_track: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  at_risk: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  achieved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  missed: "bg-red-500/10 text-red-400 border-red-500/20",
};

const PLAN_STATUS: Record<string, string> = {
  active: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  archived: "bg-muted text-muted-foreground border-border",
};

function goalPct(g: { current_value: number | null; target_value: number | null; status: string }) {
  if (g.status === "achieved") return 100;
  if (g.target_value && g.target_value > 0) {
    return Math.min(100, Math.max(0, Math.round(((g.current_value ?? 0) / g.target_value) * 100)));
  }
  return 0;
}

function PlanDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["coaching-plan", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_plans")
        .select("*, agent:agents(id, full_name, department, employee_id)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Not found");
      return data;
    },
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["coaching-goals", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_goals")
        .select("*")
        .eq("plan_id", id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["coaching-plan", id] });
    qc.invalidateQueries({ queryKey: ["coaching-goals", id] });
    qc.invalidateQueries({ queryKey: ["coaching-plans"] });
  };

  const setStatus = useMutation({
    mutationFn: async (status: "active" | "completed" | "archived") => {
      const { error } = await supabase.from("coaching_plans").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Plan updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removePlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("coaching_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan deleted"); navigate({ to: "/coaching/plans" }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !plan) {
    return (
      <div>
        <PageHeader title="Coaching plan" subtitle="Loading…" />
        <div className="mx-auto max-w-5xl px-8 pb-12 pt-6 grid grid-cols-1 lg:grid-cols-3 gap-6" aria-busy="true">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-24 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
            <div className="h-64 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-48 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
            <div className="h-32 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }
  const p = plan as any;

  const achieved = goals.filter((g: any) => g.status === "achieved").length;
  const overall = goals.length
    ? Math.round(goals.reduce((s: number, g: any) => s + goalPct(g) * (g.weight ?? 1), 0) /
        goals.reduce((s: number, g: any) => s + (g.weight ?? 1), 0))
    : 0;

  return (
    <div>
      <PageHeader
        title={p.title}
        subtitle={`${p.agent?.full_name ?? "—"} · started ${safeDate(p.start_date)}${p.target_date ? " · target " + safeDate(p.target_date) : ""}`}
        actions={
          <Link to="/coaching/plans">
            <Button variant="ghost" size="sm" className="h-8 gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl px-8 pb-12 pt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold">Overall progress</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <Target className="inline h-3 w-3 mr-1" />{achieved}/{goals.length} goals achieved
                </p>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{overall}%</div>
            </div>
            <Progress value={overall} className="h-2" />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Goals</h3>
              <AddGoalDialog planId={id} onDone={invalidate} />
            </div>
            {goals.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No goals yet. Add measurable goals to track progress.
              </p>
            ) : (
              <div className="space-y-3">
                {goals.map((g: any) => (
                  <GoalRow key={g.id} goal={g} onUpdated={invalidate} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <Badge variant="outline" className={cn("capitalize", PLAN_STATUS[p.status])}>{p.status}</Badge>
            {p.description && (
              <>
                <div className="text-xs text-muted-foreground mt-4 mb-1">Description</div>
                <p className="text-sm whitespace-pre-wrap">{p.description}</p>
              </>
            )}
            <div className="mt-4 space-y-2 text-xs">
              <div><span className="text-muted-foreground">Agent:</span> <span className="font-medium">{p.agent?.full_name}</span></div>
              <div><span className="text-muted-foreground">Department:</span> {p.agent?.department ?? "—"}</div>
              <div><span className="text-muted-foreground">Start:</span> {safeDate(p.start_date)}</div>
              {p.target_date && <div><span className="text-muted-foreground">Target:</span> {safeDate(p.target_date)}</div>}
            </div>
          </Card>

          <Card className="p-5 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground mb-1">Actions</div>
            {p.status !== "completed" && (
              <Button size="sm" className="w-full gap-1.5" onClick={() => setStatus.mutate("completed")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark completed
              </Button>
            )}
            {p.status !== "active" && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setStatus.mutate("active")}>
                Reactivate
              </Button>
            )}
            {p.status !== "archived" && (
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setStatus.mutate("archived")}>
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            )}
            <Link to="/coaching/new" search={{ agent: p.agent_id }}>
              <Button size="sm" variant="outline" className="w-full">Schedule session</Button>
            </Link>
          </Card>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full text-xs text-destructive/70 hover:text-destructive">
                Delete plan
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete coaching plan?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the plan and every goal, progress entry, and linked session record. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => removePlan.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function AddGoalDialog({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", metric: "", target_value: "", target_date: "", weight: "1" });

  const create = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 3) throw new Error("Title too short");
      const payload: any = {
        plan_id: planId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        metric: form.metric.trim() || null,
        target_value: form.target_value ? Number(form.target_value) : null,
        target_date: form.target_date || null,
        weight: Number(form.weight) || 1,
      };
      const { error } = await supabase.from("coaching_goals").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Goal added");
      setOpen(false);
      setForm({ title: "", description: "", metric: "", target_value: "", target_date: "", weight: "1" });
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><Plus className="h-3 w-3" /> Add goal</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New goal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-title">Title</Label>
            <Input id="g-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Reach 90% CSAT" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-desc">Description</Label>
            <Textarea id="g-desc" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-metric">Metric</Label>
              <Input id="g-metric" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}
                placeholder="CSAT %" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-target">Target value</Label>
              <Input id="g-target" type="number" value={form.target_value}
                onChange={(e) => setForm({ ...form, target_value: e.target.value })} placeholder="90" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-date">Target date</Label>
              <Input id="g-date" type="date" value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-weight">Weight</Label>
              <Input id="g-weight" type="number" min={1} max={10} value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalRow({ goal, onUpdated }: { goal: any; onUpdated: () => void }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  const { data: history = [] } = useQuery({
    queryKey: ["goal-progress", goal.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("goal_progress")
        .select("*").eq("goal_id", goal.id).order("recorded_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: expanded,
  });

  const record = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const payload: any = {
        goal_id: goal.id,
        value: value ? Number(value) : null,
        note: note.trim() || null,
        recorded_by: user.user.id,
      };
      const { error } = await supabase.from("goal_progress").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Progress recorded");
      setValue(""); setNote("");
      qc.invalidateQueries({ queryKey: ["goal-progress", goal.id] });
      onUpdated();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateGoal = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("coaching_goals").update(patch).eq("id", goal.id);
      if (error) throw error;
    },
    onSuccess: onUpdated,
  });

  const removeGoal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("coaching_goals").delete().eq("id", goal.id);
      if (error) throw error;
    },
    onSuccess: onUpdated,
  });

  const pct = goalPct(goal);

  return (
    <div className="rounded-md border border-border/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <button className="flex-1 min-w-0 text-left" onClick={() => setExpanded((v) => !v)}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{goal.title}</span>
            <Badge variant="outline" className={cn("text-[10px] capitalize", GOAL_STATUS[goal.status])}>
              {goal.status.replace("_", " ")}
            </Badge>
          </div>
          {goal.metric && (
            <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {goal.current_value ?? 0}{goal.target_value ? ` / ${goal.target_value}` : ""} {goal.metric}
              {goal.target_date && <span> · by {safeDate(goal.target_date)}</span>}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Progress value={pct} className="h-1.5 flex-1" />
            <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">{pct}%</span>
          </div>
        </button>
        <div className="flex items-center gap-1">
          <Select value={goal.status} onValueChange={(v) => updateGoal.mutate({ status: v, achieved_at: v === "achieved" ? new Date().toISOString() : null })}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="on_track">On track</SelectItem>
              <SelectItem value="at_risk">At risk</SelectItem>
              <SelectItem value="achieved">Achieved</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => { if (confirm("Delete this goal?")) removeGoal.mutate(); }}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-border/50 pt-3 space-y-3">
          {goal.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{goal.description}</p>}

          <div className="flex gap-2">
            <Input type="number" placeholder="New value" value={value}
              onChange={(e) => setValue(e.target.value)} className="w-28" />
            <Input placeholder="Note (optional)" value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") record.mutate(); }} />
            <Button size="sm" onClick={() => record.mutate()} disabled={record.isPending} className="gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Log
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Progress history</div>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No entries yet.</p>
            ) : (
              <ul className="space-y-1">
                {history.map((h: any) => (
                  <li key={h.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground w-32 shrink-0">
                      {new Date(h.recorded_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {h.value !== null && h.value !== undefined && (
                      <span className="font-medium tabular-nums w-16 shrink-0">{h.value}</span>
                    )}
                    <span className="text-muted-foreground truncate">{h.note ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
