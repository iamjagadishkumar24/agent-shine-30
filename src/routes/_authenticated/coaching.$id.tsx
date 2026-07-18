import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Trash2, Plus, ArrowLeft, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const safeDate = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};
const safeDateTime = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-8 pb-12 pt-6 grid grid-cols-1 lg:grid-cols-3 gap-6" aria-busy="true">
      <div className="lg:col-span-2 space-y-6">
        <div className="h-64 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
        <div className="h-32 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="h-40 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
        <div className="h-24 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/coaching/$id")({
  component: SessionDetail,
});

const ITEM_STATUS_STYLES: Record<string, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-400",
  done: "bg-emerald-500/10 text-emerald-400",
  blocked: "bg-amber-500/10 text-amber-400",
};

function SessionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newItem, setNewItem] = useState("");
  const [newDue, setNewDue] = useState("");
  const [outcome, setOutcome] = useState("");

  const { data: session, isLoading } = useQuery({
    queryKey: ["coaching-session", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_sessions")
        .select("*, agent:agents(id, full_name, department, employee_id), feedback:feedback(id, title)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Not found");
      setOutcome((data as any).outcome ?? "");
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["action-items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("coaching_action_items")
        .select("*").eq("session_id", id).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["coaching-session", id] });
    qc.invalidateQueries({ queryKey: ["action-items", id] });
    qc.invalidateQueries({ queryKey: ["coaching-sessions"] });
  };

  const addItem = useMutation({
    mutationFn: async () => {
      const title = newItem.trim();
      if (!title) throw new Error("Enter a title");
      const { error } = await supabase.from("coaching_action_items").insert({
        session_id: id, title, due_date: newDue || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNewItem(""); setNewDue(""); invalidate(); toast.success("Action item added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, patch }: { itemId: string; patch: any }) => {
      if (patch.status === "done") patch.completed_at = new Date().toISOString();
      if (patch.status && patch.status !== "done") patch.completed_at = null;
      const { error } = await supabase.from("coaching_action_items").update(patch).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("coaching_action_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const transition = useMutation({
    mutationFn: async (status: "completed" | "canceled" | "no_show") => {
      const patch: any = { status };
      if (status === "completed") {
        patch.completed_at = new Date().toISOString();
        patch.outcome = outcome || null;
      }
      const { error } = await supabase.from("coaching_sessions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Session updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("coaching_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Session deleted"); navigate({ to: "/coaching" }); },
  });

  if (isLoading || !session) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  const s = session as any;
  const done = items.filter((i: any) => i.status === "done").length;
  const isActive = s.status === "scheduled";

  return (
    <div>
      <PageHeader
        title={s.topic}
        subtitle={`with ${s.agent?.full_name ?? "—"} · ${new Date(s.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
        actions={
          <Link to="/coaching">
            <Button variant="ghost" size="sm" className="h-8 gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back</Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl px-8 pb-12 pt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Action items</h3>
              <span className="text-xs text-muted-foreground">{done} / {items.length} completed</span>
            </div>

            <div className="space-y-1.5 mb-4">
              {items.length === 0 && <p className="text-xs text-muted-foreground py-2">No action items yet.</p>}
              {items.map((it: any) => (
                <div key={it.id} className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2">
                  <Checkbox
                    checked={it.status === "done"}
                    onCheckedChange={(v) => updateItem.mutate({ itemId: it.id, patch: { status: v ? "done" : "open" } })}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-sm truncate", it.status === "done" && "line-through text-muted-foreground")}>{it.title}</div>
                    {it.due_date && <div className="text-[11px] text-muted-foreground">Due {new Date(it.due_date).toLocaleDateString()}</div>}
                  </div>
                  <Select value={it.status} onValueChange={(v) => updateItem.mutate({ itemId: it.id, patch: { status: v } })}>
                    <SelectTrigger className={cn("h-7 w-32 text-xs border-none", ITEM_STATUS_STYLES[it.status])}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem.mutate(it.id)} aria-label="Delete item">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t border-border/50 pt-3">
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an action item…"
                onKeyDown={(e) => { if (e.key === "Enter") addItem.mutate(); }} />
              <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="w-40" />
              <Button size="sm" onClick={() => addItem.mutate()} className="gap-1"><Plus className="h-3.5 w-3.5" /> Add</Button>
            </div>
          </Card>

          {s.notes && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold mb-2">Agenda / notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.notes}</p>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-2">Outcome</h3>
            <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)}
              placeholder="Record what happened, decisions, follow-up owner…"
              disabled={!isActive && s.status !== "completed"} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <Badge variant="outline" className="capitalize">{(s.status ?? "scheduled").replace("_", " ")}</Badge>
            <div className="mt-4 space-y-2 text-xs">
              <div><span className="text-muted-foreground">Agent:</span> <span className="font-medium">{s.agent?.full_name ?? "Unassigned"}</span></div>
              <div><span className="text-muted-foreground">Department:</span> {s.agent?.department ?? "—"}</div>
              <div><span className="text-muted-foreground">Duration:</span> {s.duration_minutes ?? 30} min</div>
              {s.feedback && (
                <div>
                  <span className="text-muted-foreground">Feedback:</span>{" "}
                  <Link to="/feedback/$id" params={{ id: s.feedback.id }} className="text-primary hover:underline">
                    {s.feedback.title}
                  </Link>
                </div>
              )}
              {s.completed_at && <div><span className="text-muted-foreground">Completed:</span> {new Date(s.completed_at).toLocaleString()}</div>}
            </div>
          </Card>

          {isActive && (
            <Card className="p-5 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground mb-1">Actions</div>
              <Button size="sm" className="w-full gap-1.5" onClick={() => transition.mutate("completed")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark completed
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => transition.mutate("no_show")}>
                No-show
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => transition.mutate("canceled")}>
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </Button>
            </Card>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full text-xs text-destructive/70 hover:text-destructive">
                Delete session
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete coaching session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the session and its action items. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteSession.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
