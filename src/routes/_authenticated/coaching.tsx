import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import type { EventContentArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { toast } from "sonner";
import {
  CalendarPlus, LayoutGrid, ListFilter, Search, CalendarDays,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import "@/components/coaching/fullcalendar-theme.css";
import { useIsMobile } from "@/hooks/use-mobile";

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
import {
  DataTableShell, DataTableHeader, DataTableRow, DataTableCell,
  SortableTh, useTableSort, sortRows,
  TableEmpty, TablePagination, usePagination, paginate,
} from "@/components/ui/data-table";

export const Route = createFileRoute("/_authenticated/coaching")({
  component: CoachingCalendar,
});

type FcView = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";

const VIEW_OPTIONS: { id: FcView; label: string }[] = [
  { id: "dayGridMonth", label: "Month" },
  { id: "timeGridWeek", label: "Week" },
  { id: "timeGridDay",  label: "Day" },
  { id: "listWeek",     label: "Agenda" },
];

// Palette per session type — soft tint + strong accent (light theme, WCAG AA on white)
const TYPE_PALETTE: Record<string, { tint: string; color: string; text: string }> = {
  coaching:   { tint: "#eff6ff", color: "#2563eb", text: "#1d4ed8" }, // blue
  review:     { tint: "#fef2f2", color: "#e11d48", text: "#be123c" }, // rose
  one_on_one: { tint: "#f5f3ff", color: "#7c3aed", text: "#6d28d9" }, // violet
  training:   { tint: "#fffbeb", color: "#d97706", text: "#b45309" }, // amber
  follow_up:  { tint: "#ecfeff", color: "#0891b2", text: "#0e7490" }, // cyan
  feedback:   { tint: "#ecfdf5", color: "#10b981", text: "#047857" }, // emerald
};
function paletteFor(sessionType?: string) {
  return TYPE_PALETTE[sessionType ?? "coaching"] ?? TYPE_PALETTE.coaching;
}

const STATUS_META: Record<string, { label: string; className: string; dot: string }> = {
  scheduled:        { label: "Scheduled",   className: "bg-blue-50 text-blue-700 border-blue-200",        dot: "#3b82f6" },
  pending_approval: { label: "Pending",     className: "bg-amber-50 text-amber-700 border-amber-200",     dot: "#f59e0b" },
  confirmed:        { label: "Confirmed",   className: "bg-cyan-50 text-cyan-700 border-cyan-200",        dot: "#06b6d4" },
  in_progress:      { label: "In progress", className: "bg-violet-50 text-violet-700 border-violet-200",  dot: "#8b5cf6" },
  completed:        { label: "Completed",   className: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "#10b981" },
  canceled:         { label: "Cancelled",   className: "bg-muted text-muted-foreground border-border",    dot: "#71717a" },
  missed:           { label: "Missed",      className: "bg-rose-50 text-rose-700 border-rose-200",        dot: "#f43f5e" },
  rescheduled:      { label: "Rescheduled", className: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", dot: "#d946ef" },
};

function CoachingCalendar() {
  useRealtimeInvalidate("coaching_sessions", [["coaching-sessions"]]);
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const calendarRef = useRef<FullCalendar | null>(null);
  const [view, setView] = useState<FcView>("dayGridMonth");
  const [periodLabel, setPeriodLabel] = useState<string>("");
  const [status, setStatus] = useState<string>("all");
  const [sessionType, setSessionType] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [agentId, setAgentId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"calendar" | "list">("calendar");

  // On small viewports, agenda is the most usable calendar view.
  useEffect(() => {
    if (isMobile && view === "dayGridMonth") {
      setView("listWeek");
      calendarRef.current?.getApi().changeView("listWeek");
    }
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

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

  type CoachSort = "topic" | "agent" | "scheduled_at" | "session_type" | "priority" | "status";
  const { field: sortField, dir: sortDir, onSort } = useTableSort<CoachSort>("scheduled_at", "desc");
  const PRIORITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
  const sorted = useMemo(() => sortRows(filtered, (s: any) => {
    switch (sortField) {
      case "topic": return s.topic ?? "";
      case "agent": return s.agent?.full_name ?? "";
      case "scheduled_at": return s.scheduled_at ? new Date(s.scheduled_at) : null;
      case "session_type": return s.session_type ?? "coaching";
      case "priority": return PRIORITY_ORDER[s.priority ?? "medium"] ?? 1;
      case "status": return s.status ?? "scheduled";
      default: return null;
    }
  }, sortDir), [filtered, sortField, sortDir]);

  const { page, pageSize, setPage, setPageSize } = usePagination(sorted.length, 25);
  const paged = paginate(sorted, page, pageSize);

  const sessionsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of filtered) map.set(s.id, s);
    return map;
  }, [filtered]);

  const events = useMemo<EventInput[]>(() => filtered
    .filter((s) => s.scheduled_at)
    .map((s) => {
      const start = new Date(s.scheduled_at);
      const end = new Date(start.getTime() + (s.duration_minutes ?? 30) * 60000);
      const pal = paletteFor(s.session_type);
      return {
        id: s.id,
        title: s.topic ?? "Untitled",
        start,
        end,
        extendedProps: { session: s },
        backgroundColor: pal.tint,
        borderColor: pal.color,
        textColor: pal.text,
      };
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
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "Could not reschedule");
      if (/overlap/i.test(msg)) {
        toast.error("Time conflict", { description: "Another session overlaps this slot for the agent or coach. Pick a different time." });
      } else {
        toast.error(msg);
      }
    },
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

  const goto = (action: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (action === "prev") api.prev();
    else if (action === "next") api.next();
    else api.today();
  };
  const changeView = (v: FcView) => {
    setView(v);
    calendarRef.current?.getApi().changeView(v);
  };

  const renderEventContent = (arg: EventContentArg) => {
    const time = arg.timeText;
    return (
      <div className="qp-event" style={{
        // @ts-expect-error CSS custom props
        "--qp-color": arg.event.borderColor,
        "--qp-tint":  arg.event.backgroundColor,
        "--qp-text":  arg.event.textColor,
      }}>
        {time && <span className="qp-event-time">{time}</span>}
        <span className="qp-event-title">{arg.event.title}</span>
      </div>
    );
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

      <div className="mx-auto max-w-[1600px] px-4 pb-12 pt-4 space-y-4 sm:px-6">
        <Card className="p-3" role="search" aria-label="Filter coaching sessions">
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <div className="relative col-span-2 min-w-0 flex-1 sm:min-w-[220px]">
              <label htmlFor="coaching-search" className="sr-only">Search topic or agent</label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="coaching-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search topic or agent"
                className="h-9 pl-8 sm:h-8"
              />
            </div>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger aria-label="Filter by agent" className="h-9 w-full sm:h-8 sm:w-[180px]"><SelectValue placeholder="Agent" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filter by status" className="h-9 w-full sm:h-8 sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger aria-label="Filter by session type" className="h-9 w-full sm:h-8 sm:w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
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
              <SelectTrigger aria-label="Filter by priority" className="h-9 w-full sm:h-8 sm:w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
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
          <Card
            className="p-0 overflow-hidden"
            role="region"
            aria-label={`Coaching calendar, ${VIEW_OPTIONS.find((v) => v.id === view)?.label ?? "Month"} view${periodLabel ? `, ${periodLabel}` : ""}`}
          >
            {/* Minimalist executive toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 px-3 font-medium" onClick={() => goto("today")}>
                  Today
                </Button>
                <div className="mx-1 flex items-center rounded-md border border-border/70" role="group" aria-label="Navigate calendar">
                  <button
                    type="button"
                    onClick={() => goto("prev")}
                    className="flex h-8 w-8 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    aria-label="Previous period"
                  >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <span aria-hidden="true" className="h-4 w-px bg-border/70" />
                  <button
                    type="button"
                    onClick={() => goto("next")}
                    className="flex h-8 w-8 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    aria-label="Next period"
                  >
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
                <h2 aria-live="polite" className="ml-2 truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
                  {periodLabel}
                </h2>
              </div>

              <div
                role="tablist"
                aria-label="Calendar view"
                className="inline-flex rounded-md border border-border/70 bg-muted/30 p-0.5"
              >
                {VIEW_OPTIONS.map((v) => {
                  const selected = view === v.id;
                  return (
                    <button
                      key={v.id}
                      role="tab"
                      type="button"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => changeView(v.id)}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                        e.preventDefault();
                        const idx = VIEW_OPTIONS.findIndex((o) => o.id === view);
                        const next = e.key === "ArrowRight"
                          ? VIEW_OPTIONS[(idx + 1) % VIEW_OPTIONS.length]
                          : VIEW_OPTIONS[(idx - 1 + VIEW_OPTIONS.length) % VIEW_OPTIONS.length];
                        changeView(next.id);
                      }}
                      className={cn(
                        "h-7 rounded px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="qp-fc p-2 sm:p-3">
              <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                initialView={view}
                headerToolbar={false}
                height={isMobile ? 560 : 720}
                firstDay={1}
                dayMaxEvents={isMobile ? 2 : 3}
                nowIndicator
                selectable
                editable
                eventResizableFromStart
                allDaySlot={false}
                slotMinTime="06:00:00"
                slotMaxTime="22:00:00"
                slotDuration="00:30:00"
                slotLabelFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
                eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
                dayHeaderFormat={{ weekday: "short" }}
                events={events}
                eventContent={renderEventContent}
                eventInteractive
                longPressDelay={250}
                selectLongPressDelay={250}
                eventDidMount={(info) => {
                  const s: any = (info.event.extendedProps as any).session;
                  const when = info.event.start?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) ?? "";
                  const parts = [
                    info.event.title,
                    when,
                    s?.agent?.full_name ? `with ${s.agent.full_name}` : null,
                    s?.session_type ? String(s.session_type).replace("_", " ") : null,
                    s?.status ? `status ${STATUS_META[s.status]?.label ?? s.status}` : null,
                  ].filter(Boolean);
                  info.el.setAttribute("aria-label", parts.join(", "));
                }}
                datesSet={(arg) => setPeriodLabel(arg.view.title)}
                dateClick={(arg) => {
                  const start = arg.date;
                  const end = new Date(start.getTime() + 30 * 60000);
                  openCreate(start, end);
                }}
                select={(arg) => openCreate(arg.start, arg.end)}
                eventClick={(arg) => {
                  const s = (arg.event.extendedProps as any).session ?? sessionsById.get(arg.event.id);
                  if (s) openEdit(s);
                }}
                eventDrop={(arg) => {
                  if (!arg.event.start || !arg.event.end) { arg.revert(); return; }
                  reschedule.mutate(
                    { id: arg.event.id, start: arg.event.start, end: arg.event.end },
                    { onError: () => arg.revert() }
                  );
                }}
                eventResize={(arg) => {
                  if (!arg.event.start || !arg.event.end) { arg.revert(); return; }
                  reschedule.mutate(
                    { id: arg.event.id, start: arg.event.start, end: arg.event.end },
                    { onError: () => arg.revert() }
                  );
                }}
                noEventsContent={() => "No sessions in this range."}
              />
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <DataTableShell className="rounded-none border-0">
              <DataTableHeader>
                <tr>
                  <SortableTh field="topic" active={sortField} dir={sortDir} onSort={onSort}>Topic</SortableTh>
                  <SortableTh field="agent" active={sortField} dir={sortDir} onSort={onSort}>Agent</SortableTh>
                  <SortableTh field="scheduled_at" active={sortField} dir={sortDir} onSort={onSort}>Scheduled</SortableTh>
                  <SortableTh field="session_type" active={sortField} dir={sortDir} onSort={onSort}>Type</SortableTh>
                  <SortableTh field="priority" active={sortField} dir={sortDir} onSort={onSort}>Priority</SortableTh>
                  <SortableTh field="status" active={sortField} dir={sortDir} onSort={onSort}>Status</SortableTh>
                </tr>
              </DataTableHeader>
              <tbody>
                {isLoading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-border/40 last:border-0" aria-busy="true">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="border-b border-border/40 px-4 py-3.5">
                        <div className="h-3 w-24 bg-muted/40 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isLoading && paged.map((s: any) => {
                  const sched = s.scheduled_at ? new Date(s.scheduled_at) : null;
                  const meta = STATUS_META[s.status ?? "scheduled"] ?? STATUS_META.scheduled;
                  return (
                    <DataTableRow key={s.id} onClick={() => openEdit(s)} className="cursor-pointer">
                      <DataTableCell>
                        <Link to="/coaching/$id" params={{ id: s.id }} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                          {s.topic || "Untitled"}
                        </Link>
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">{s.agent?.full_name ?? "—"}</DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {sched && !Number.isNaN(sched.getTime()) ? sched.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground capitalize">{(s.session_type ?? "coaching").replace("_", " ")}</DataTableCell>
                      <DataTableCell className="text-muted-foreground capitalize">{s.priority ?? "medium"}</DataTableCell>
                      <DataTableCell>
                        <Badge variant="outline" className={cn("text-xs", meta.className)}>{meta.label}</Badge>
                      </DataTableCell>
                    </DataTableRow>
                  );
                })}
                {!isLoading && sorted.length === 0 && (
                  <TableEmpty
                    colSpan={6}
                    icon={CalendarDays}
                    title="No sessions match your filters"
                    message="Try adjusting the filters above, or schedule a new session to get started."
                    action={
                      <Button size="sm" onClick={() => openCreate()}>
                        <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Schedule session
                      </Button>
                    }
                  />
                )}
              </tbody>
            </DataTableShell>
            {sorted.length > 0 && (
              <TablePagination
                page={page}
                pageSize={pageSize}
                total={sorted.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
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
