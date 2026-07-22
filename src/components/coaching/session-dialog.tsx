import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AddToCalendarMenu } from "@/components/coaching/add-to-calendar-menu";
import {
  COACHING_STATUS_VALUES,
  COACHING_STATUS_LABELS,
  coachingStatusSchema,
  normalizeCoachingStatus,
} from "@/lib/coaching-status";

export type SessionRow = {
  id?: string;
  topic?: string;
  agent_id?: string;
  coach_id?: string | null;
  scheduled_at?: string;
  duration_minutes?: number;
  status?: string;
  session_type?: string;
  priority?: string;
  meeting_link?: string | null;
  meeting_location?: string | null;
  agenda?: string | null;
  notes?: string | null;
  follow_up_date?: string | null;
  reminder_minutes?: number | null;
  feedback_id?: string | null;
  plan_id?: string | null;
};

const Schema = z.object({
  topic: z.string().trim().min(4, "Topic must be at least 4 characters").max(200),
  agent_id: z.string().uuid("Pick an agent"),
  date: z.string().min(1, "Pick a date"),
  start_time: z.string().min(1, "Pick a start time"),
  end_time: z.string().min(1, "Pick an end time"),
  session_type: z.enum(["coaching", "review", "one_on_one", "training", "follow_up"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: coachingStatusSchema,
  meeting_link: z.string().trim().url("Invalid URL").max(500).optional().or(z.literal("")),
  meeting_location: z.string().trim().max(200).optional(),
  agenda: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
  follow_up_date: z.string().optional(),
  reminder_minutes: z.string().optional(),
});

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function combine(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session?: SessionRow | null;
  initialStart?: Date | null;
  initialEnd?: Date | null;
  onSaved?: (id: string) => void;
}

export function SessionDialog({ open, onOpenChange, session, initialStart, initialEnd, onSaved }: Props) {
  const qc = useQueryClient();
  const isEdit = !!session?.id;

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, full_name, department, email").order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const startIso = session?.scheduled_at ?? initialStart?.toISOString();
  const startBits = useMemo(() => toLocalInput(startIso), [startIso]);
  const endIso = useMemo(() => {
    if (initialEnd) return initialEnd.toISOString();
    if (session?.scheduled_at && session?.duration_minutes)
      return new Date(new Date(session.scheduled_at).getTime() + session.duration_minutes * 60000).toISOString();
    if (initialStart) return new Date(initialStart.getTime() + 30 * 60000).toISOString();
    return "";
  }, [initialEnd, initialStart, session]);
  const endBits = useMemo(() => toLocalInput(endIso), [endIso]);

  const [form, setForm] = useState({
    topic: "",
    agent_id: "",
    date: "",
    start_time: "",
    end_time: "",
    session_type: "coaching" as "coaching" | "review" | "one_on_one" | "training" | "follow_up",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    status: "scheduled" as import("@/lib/coaching-status").CoachingStatus,
    meeting_link: "",
    meeting_location: "",
    agenda: "",
    notes: "",
    follow_up_date: "",
    reminder_minutes: "",
  });

  const [savedEvent, setSavedEvent] = useState<import("@/lib/calendar-links").CalendarEvent | null>(null);
  const agentLookup = useMemo(() => new Map(agents.map((a: any) => [a.id, a])), [agents]);

  const buildEventFromForm = (id: string): import("@/lib/calendar-links").CalendarEvent => {
    const startISO = combine(form.date, form.start_time).toISOString();
    const endISO = combine(form.date, form.end_time).toISOString();
    const agent = agentLookup.get(form.agent_id) as any;
    const parts: string[] = [];
    if (form.agenda) parts.push(`Agenda:\n${form.agenda}`);
    if (form.notes) parts.push(`Notes:\n${form.notes}`);
    if (agent?.full_name) parts.push(`Agent: ${agent.full_name}`);
    return {
      uid: `${id}@qualipulse.coaching`,
      title: form.topic || "Coaching session",
      description: parts.join("\n\n") || undefined,
      location: form.meeting_location || undefined,
      url: form.meeting_link || undefined,
      startISO,
      endISO,
      attendees: agent?.email ? [{ email: agent.email, name: agent.full_name ?? undefined }] : [],
      reminderMinutes: form.reminder_minutes ? Number(form.reminder_minutes) : null,
    };
  };

  useEffect(() => {
    if (!open) return;
    setForm({
      topic: session?.topic ?? "",
      agent_id: session?.agent_id ?? "",
      date: startBits.date,
      start_time: startBits.time,
      end_time: endBits.time || startBits.time,
      session_type: (session?.session_type as any) ?? "coaching",
      priority: (session?.priority as any) ?? "medium",
      status: normalizeCoachingStatus(session?.status) ?? "scheduled",
      meeting_link: session?.meeting_link ?? "",
      meeting_location: session?.meeting_location ?? "",
      agenda: session?.agenda ?? "",
      notes: session?.notes ?? "",
      follow_up_date: session?.follow_up_date ?? "",
      reminder_minutes: session?.reminder_minutes != null ? String(session.reminder_minutes) : "",
    });
    setSavedEvent(null);
  }, [open, session, startBits.date, startBits.time, endBits.time]);

  const parsed = Schema.safeParse(form);
  const errors: Record<string, string> = {};
  let durationMin = 0;
  if (parsed.success) {
    const s = combine(parsed.data.date, parsed.data.start_time);
    const e = combine(parsed.data.date, parsed.data.end_time);
    durationMin = Math.round((e.getTime() - s.getTime()) / 60000);
    if (!Number.isFinite(durationMin) || durationMin < 5) errors.end_time = "End must be at least 5 minutes after start";
    if (durationMin > 480) errors.end_time = "Max 8 hours";
  } else {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
    }
  }
  const canSubmit = parsed.success && Object.keys(errors).length === 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const data = parsed.data;
      const startAt = combine(data.date, data.start_time);
      const payload: any = {
        topic: data.topic,
        agent_id: data.agent_id,
        scheduled_at: startAt.toISOString(),
        duration_minutes: durationMin,
        session_type: data.session_type,
        priority: data.priority,
        status: normalizeCoachingStatus(data.status) ?? "scheduled",
        meeting_link: data.meeting_link || null,
        meeting_location: data.meeting_location || null,
        agenda: data.agenda || null,
        notes: data.notes || null,
        follow_up_date: data.follow_up_date || null,
        reminder_minutes: data.reminder_minutes ? Number(data.reminder_minutes) : null,
      };
      if (session?.feedback_id !== undefined) payload.feedback_id = session.feedback_id;
      if (session?.plan_id !== undefined) payload.plan_id = session.plan_id;
      if (isEdit) {
        const { data: row, error } = await supabase
          .from("coaching_sessions")
          .update(payload)
          .eq("id", session!.id!)
          .select("id")
          .single();
        if (error) throw error;
        return row;
      }
      const { data: user } = await supabase.auth.getUser();
      if (user.user) payload.coach_id = user.user.id;
      const { data: row, error } = await supabase
        .from("coaching_sessions")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["coaching-sessions"] });
      qc.invalidateQueries({ queryKey: ["coaching-session", row.id] });
      setSavedEvent(buildEventFromForm(row.id));
      onSaved?.(row.id);
      // Keep dialog open so user can add to calendar; they close it themselves.
      if (isEdit) onOpenChange(false);
    },
    onError: (e: any) => {
      // Surface the real database / RLS / trigger error text so users can act on it.
      const msg = e?.message ?? e?.details ?? e?.hint ?? "Could not save session";
      if (typeof msg === "string" && msg.toLowerCase().includes("overlap")) {
        toast.error("That time overlaps another session for this coach or agent.");
      } else if (typeof msg === "string" && msg.toLowerCase().includes("row-level security")) {
        toast.error("You don't have permission to schedule for this agent. Ask an admin to add you as coach.");
      } else {
        toast.error(String(msg).slice(0, 240));
      }
    },
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit coaching session" : "Schedule coaching session"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the details below and save." : "Book time with an agent and capture the plan."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Session title *</Label>
            <Input
              value={form.topic}
              onChange={(e) => set({ topic: e.target.value })}
              placeholder="e.g. Improve escalation handling"
              aria-invalid={!!errors.topic}
              className={cn(errors.topic && "border-destructive/60")}
            />
            {errors.topic && <p className="text-xs text-destructive">{errors.topic}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Customer Success Agent *</Label>
            <Select value={form.agent_id} onValueChange={(v) => set({ agent_id: v })}>
              <SelectTrigger aria-invalid={!!errors.agent_id} className={cn(errors.agent_id && "border-destructive/60")}>
                <SelectValue placeholder="Pick agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name}{a.department ? ` · ${a.department}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.agent_id && <p className="text-xs text-destructive">{errors.agent_id}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Session type</Label>
            <Select value={form.session_type} onValueChange={(v) => set({ session_type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="coaching">Coaching</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="one_on_one">1:1</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => set({ date: e.target.value })}
              aria-invalid={!!errors.date}
              className={cn(errors.date && "border-destructive/60")}
            />
            {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Start *</Label>
              <Input type="time" value={form.start_time} onChange={(e) => set({ start_time: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>End *</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => set({ end_time: e.target.value })}
                aria-invalid={!!errors.end_time}
                className={cn(errors.end_time && "border-destructive/60")}
              />
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            {errors.end_time && <p className="text-xs text-destructive">{errors.end_time}</p>}
            {canSubmit && durationMin > 0 && (
              <p className="text-xs text-muted-foreground">Duration: {durationMin} minutes</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set({ priority: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set({ status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COACHING_STATUS_VALUES.map((v) => (
                  <SelectItem key={v} value={v}>{COACHING_STATUS_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Meeting link</Label>
            <Input
              value={form.meeting_link}
              onChange={(e) => set({ meeting_link: e.target.value })}
              placeholder="https://meet.example.com/…"
              aria-invalid={!!errors.meeting_link}
              className={cn(errors.meeting_link && "border-destructive/60")}
            />
            {errors.meeting_link && <p className="text-xs text-destructive">{errors.meeting_link}</p>}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Meeting location</Label>
            <Input
              value={form.meeting_location}
              onChange={(e) => set({ meeting_location: e.target.value })}
              placeholder="Room 4B, or virtual"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Agenda</Label>
            <Textarea rows={3} value={form.agenda} onChange={(e) => set({ agenda: e.target.value })} placeholder="Bullet points for the discussion" />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Private notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Coach-only notes" />
          </div>

          <div className="space-y-1.5">
            <Label>Follow-up date</Label>
            <Input type="date" value={form.follow_up_date} onChange={(e) => set({ follow_up_date: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Reminder</Label>
            <Select
              value={form.reminder_minutes || "none"}
              onValueChange={(v) => set({ reminder_minutes: v === "none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="No reminder" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No reminder</SelectItem>
                <SelectItem value="10">10 minutes before</SelectItem>
                <SelectItem value="30">30 minutes before</SelectItem>
                <SelectItem value="60">1 hour before</SelectItem>
                <SelectItem value="1440">1 day before</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {savedEvent && (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
            <div className="mb-2 font-medium text-emerald-300">Session scheduled — add it to your calendar</div>
            <AddToCalendarMenu event={savedEvent} triggerLabel="Add to my calendar" />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {savedEvent ? "Close" : "Cancel"}
          </Button>
          {!savedEvent && (
            <Button onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save changes" : "Schedule session"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
