import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, dateFnsLocalizer, Views, type View, type SlotInfo } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, addMinutes } from "date-fns";
import { enUS } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarPlus, LayoutGrid, ListFilter, Search } from "lucide-react";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { PageHeader } from "@/components/layout/page-header";
import { CoachingTabs } from "@/components/coaching/coaching-tabs";
import { SessionDialog, type SessionRow } from "@/components/coaching/session-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/coaching")({
  component: CoachingCalendar,
});

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), getDay, locales });
const DnDCalendar = withDragAndDrop(Calendar as any);

const STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  scheduled:        { label: "Scheduled",       className: "bg-blue-500/15 text-blue-300 border-blue-500/30",       dot: "#3b82f6" },
  pending_approval: { label: "Pending",         className: "bg-amber-500/15 text-amber-300 border-amber-500/30",     dot: "#f59e0b" },
  confirmed:        { label: "Confirmed",       className: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",        dot: "#06b6d4" },
  in_progress:      { label: "In progress",     className: "bg-violet-500/15 text-violet-300 border-violet-500/30",  dot: "#8b5cf6" },
  completed:        { label: "Completed",       className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "#10b981" },
  canceled:         { label: "Cancelled",       className: "bg-muted text-muted-foreground border-border",           dot: "#71717a" },
  missed:           { label: "Missed",          className: "bg-rose-500/15 text-rose-300 border-rose-500/30",         dot: "#f43f5e" },
  rescheduled:      { label: "Rescheduled",     className: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30", dot: "#d946ef" },
};

function CoachingCalendar() {
  useRealtimeInvalidate("coaching_sessions", [["coaching-sessions"]]);
  const qc = useQueryClient();

  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState<Date>(new Date());
  const [status, setStatus] = useState<string>("all");
  const [sessionType, setSessionType] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [agentId, setAgentId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"calendar" | "list">("calendar");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [initialStart, setInitialStart] = useState<Date | null>(null);
  const [initialEnd, setInitialEnd] = useState<Date | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: ["agents-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["coaching-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_sessions")
        .select("*, agent:agents(id, full_name, department), items:coaching_action_items(id, status)")
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows as any[]).filter((s) => {
      if (status !== "all" && (s.status ?? "scheduled") !== status) return false;
      if (sessionType !== "all" && (s.session_type ?? "coaching") !== sessionType) return false;
      if (priority !== "all" && (s.priority ?? "medium") !== priority) return false;
      if (agentId !== "all" && s.agent_id !== agentId) return false;
      if (q && !(`${s.topic ?? ""} ${s.agent?.full_name ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, status, sessionType, priority, agentId, search]);

  const events = useMemo(() => filtered
    .filter((s) => s.scheduled_at)
    .map((s) => {
      const start = new Date(s.scheduled_at);
      const end = addMinutes(start, s.duration_minutes ?? 30);
      return { id: s.id, title: s.topic ?? "Untitled", start, end, resource: s };
    }), [filtered]);

  const reschedule = useMutation({
    mutationFn: async ({ id, start, end }: { id: string; start: Date; end: Date }) => {
      const durationMinutes = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000));
      const { error } = await supabase
        .from("coaching_sessions")
        .update({ scheduled_at: start.toISOString(), duration_minutes: durationMinutes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coaching-sessions"] });
      toast.success("Session rescheduled");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not reschedule"),
  });

  const openCreate = (start?: Date, end?: Date) => {
    setEditing(null);
    setInitialStart(start ?? null);
    setInitialEnd(end ?? null);
    setDialogOpen(true);
  };

  const openEdit = (s: any) => {
    setEditing(s as SessionRow);
    setInitialStart(null);
    setInitialEnd(null);
    setDialogOpen(true);
  };

  // Support ?create=1 for the legacy /coaching/new redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1") {
      openCreate();
      const url = new URL(window.location.href);
      url.searchParams.delete("create");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const eventPropGetter = (event: any) => {
    const s = event.resource;
    const meta = STATUS_META[s.status ?? "scheduled"] ?? STATUS_META.scheduled;
    return {
      style: {
        backgroundColor: `${meta.dot}22`,
        borderLeft: `3px solid ${meta.dot}`,
        color: "hsl(var(--foreground))",
        borderRadius: 6,
        padding: "2px 6px",
        fontSize: 12,
      },
    };
  };

  return (
    <div>
      <PageHeader
        title="Coaching"
        subtitle={`${filtered.length} session${filtered.length === 1 ? "" : "s"} · calendar view`}
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant={mode === "calendar" ? "secondary" : "ghost"} className="h-8 gap-1" onClick={() => setMode("calendar")}>
              <LayoutGrid className="h-3.5 w-3.5" /> Calendar
            </Button>
            <Button size="sm" variant={mode === "list" ? "secondary" : "ghost"} className="h-8 gap-1" onClick={() => setMode("list")}>
              <ListFilter className="h-3.5 w-3.5" /> List
            </Button>
            <Button size="sm" className="h-8 gap-1.5 ml-1" onClick={() => openCreate()}>
              <CalendarPlus className="h-3.5 w-3.5" /> Schedule session
            </Button>
          </div>
        }
      />
      <CoachingTabs />

      <div className="mx-auto max-w-[1600px] px-6 pb-12 pt-4 space-y-4">
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topic or agent" className="h-8 pl-8" />
            </div>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="coaching">Coaching</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="one_on_one">1:1</SelectItem>
                <SelectItem value="training">Training</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {mode === "calendar" ? (
          <Card className="p-3 rbc-shell">
            <DnDCalendar
              localizer={localizer}
              events={events}
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
              step={30}
              timeslots={2}
              popup
              selectable
              defaultView={Views.WEEK}
              onSelectSlot={(slot: SlotInfo) => openCreate(slot.start as Date, slot.end as Date)}
              onSelectEvent={(evt: any) => openEdit(evt.resource)}
              onDoubleClickEvent={(evt: any) => openEdit(evt.resource)}
              onEventDrop={({ event, start, end }: any) => reschedule.mutate({ id: event.id, start, end })}
              onEventResize={({ event, start, end }: any) => reschedule.mutate({ id: event.id, start, end })}
              resizable
              eventPropGetter={eventPropGetter}
              style={{ height: 720 }}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="p-6 text-xs text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-medium">No sessions match your filters</p>
                <Button size="sm" className="mt-4" onClick={() => openCreate()}>Schedule a session</Button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Topic</th>
                    <th className="px-4 py-2.5 text-left font-medium">Agent</th>
                    <th className="px-4 py-2.5 text-left font-medium">Scheduled</th>
                    <th className="px-4 py-2.5 text-left font-medium">Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Priority</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s: any) => {
                    const sched = s.scheduled_at ? new Date(s.scheduled_at) : null;
                    const meta = STATUS_META[s.status ?? "scheduled"] ?? STATUS_META.scheduled;
                    return (
                      <tr key={s.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => openEdit(s)}>
                        <td className="px-4 py-2.5">
                          <Link to="/coaching/$id" params={{ id: s.id }} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                            {s.topic || "Untitled"}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{s.agent?.full_name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {sched && !Number.isNaN(sched.getTime()) ? sched.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground capitalize">{(s.session_type ?? "coaching").replace("_", " ")}</td>
                        <td className="px-4 py-2.5 text-muted-foreground capitalize">{s.priority ?? "medium"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={cn("text-xs", meta.className)}>{meta.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {Object.entries(STATUS_META).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: v.dot }} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      <SessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        session={editing}
        initialStart={initialStart}
        initialEnd={initialEnd}
      />
    </div>
  );
}
