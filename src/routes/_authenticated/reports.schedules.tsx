import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Play, Plus, Trash2, ArrowLeft } from "lucide-react";
import {
  listReportSchedules, upsertReportSchedule, deleteReportSchedule, runReportScheduleNow,
} from "@/lib/report-schedules.functions";

export const Route = createFileRoute("/_authenticated/reports.schedules")({
  component: SchedulesPage,
});

type Schedule = {
  id: string;
  name: string;
  report_type: "agent_performance" | "feedback_trends" | "email_delivery";
  format: "pdf" | "csv" | "both";
  cadence: "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  hour_utc: number;
  recipients: string[];
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  next_run_at: string;
};

const TYPE_LABEL: Record<Schedule["report_type"], string> = {
  agent_performance: "Agent Performance",
  feedback_trends: "Feedback Trends",
  email_delivery: "Email Delivery",
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SchedulesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listReportSchedules);
  const upsert = useServerFn(upsertReportSchedule);
  const del = useServerFn(deleteReportSchedule);
  const runNow = useServerFn(runReportScheduleNow);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["report-schedules"],
    queryFn: () => list(),
  });

  const [editing, setEditing] = useState<Partial<Schedule> | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["report-schedules"] });

  const saveMut = useMutation({
    mutationFn: async (payload: any) => upsert({ data: payload }),
    onSuccess: () => { toast.success("Schedule saved"); setEditing(null); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Schedule deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });
  const runMut = useMutation({
    mutationFn: async (id: string) => runNow({ data: { id } }),
    onSuccess: (r: any) => { r?.ok ? toast.success(`Enqueued ${r.enqueued} email(s)`) : toast.error(r?.error ?? "Run failed"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Run failed"),
  });

  return (
    <div>
      <PageHeader
        title="Scheduled reports"
        subtitle="Deliver PDF or CSV reports to recipients on a weekly or monthly cadence."
        actions={
          <>
            <Button asChild variant="ghost" size="sm"><Link to="/reports"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Reports</Link></Button>
            <Button size="sm" onClick={() => setEditing({ format: "pdf", cadence: "weekly", hour_utc: 13, day_of_week: 1, day_of_month: 1, recipients: [], enabled: true, report_type: "agent_performance", name: "" })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New schedule
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-5xl px-8 pb-12 pt-6 space-y-3">
        {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>}
        {!isLoading && schedules.length === 0 && (
          <Card className="p-8 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-semibold">No scheduled reports yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">Create one to email PDF/CSV reports on a cadence.</p>
          </Card>
        )}
        {(schedules as Schedule[]).map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">{s.name}</h3>
                  <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[s.report_type]}</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">{s.format}</Badge>
                  <Badge variant={s.enabled ? "default" : "secondary"} className="text-[10px]">
                    {s.enabled ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {s.cadence === "weekly"
                    ? `Every ${DOW[s.day_of_week ?? 1]} at ${String(s.hour_utc).padStart(2, "0")}:00 UTC`
                    : `Monthly on day ${s.day_of_month ?? 1} at ${String(s.hour_utc).padStart(2, "0")}:00 UTC`}
                  {" · "}Next run: {new Date(s.next_run_at).toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  Recipients: {s.recipients.join(", ") || "—"}
                </div>
                {s.last_run_at && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Last run: {new Date(s.last_run_at).toLocaleString()} · {s.last_status ?? "—"}
                    {s.last_error ? ` · ${s.last_error}` : ""}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => runMut.mutate(s.id)} disabled={runMut.isPending}>
                  <Play className="mr-1.5 h-3 w-3" /> Run now
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(s)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => confirm("Delete this schedule?") && delMut.mutate(s.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit schedule" : "New schedule"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Weekly ops digest" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Report</Label>
                  <Select value={editing.report_type} onValueChange={(v: any) => setEditing({ ...editing, report_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent_performance">Agent Performance</SelectItem>
                      <SelectItem value="feedback_trends">Feedback Trends</SelectItem>
                      <SelectItem value="email_delivery">Email Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Format</Label>
                  <Select value={editing.format} onValueChange={(v: any) => setEditing({ ...editing, format: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Cadence</Label>
                  <Select value={editing.cadence} onValueChange={(v: any) => setEditing({ ...editing, cadence: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editing.cadence === "weekly" ? (
                  <div>
                    <Label>Day of week</Label>
                    <Select value={String(editing.day_of_week ?? 1)} onValueChange={(v) => setEditing({ ...editing, day_of_week: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOW.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>Day of month</Label>
                    <Input type="number" min={1} max={28} value={editing.day_of_month ?? 1}
                      onChange={(e) => setEditing({ ...editing, day_of_month: Number(e.target.value) })} />
                  </div>
                )}
                <div>
                  <Label>Hour (UTC)</Label>
                  <Input type="number" min={0} max={23} value={editing.hour_utc ?? 13}
                    onChange={(e) => setEditing({ ...editing, hour_utc: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Recipients (comma-separated emails)</Label>
                <Input
                  value={(editing.recipients ?? []).join(", ")}
                  onChange={(e) => setEditing({ ...editing, recipients: e.target.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) })}
                  placeholder="ops@company.com, leadership@company.com"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Enabled</div>
                  <div className="text-xs text-muted-foreground">Disable to pause without deleting.</div>
                </div>
                <Switch checked={editing.enabled ?? true} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={saveMut.isPending}
              onClick={() => {
                if (!editing) return;
                if (!editing.name?.trim()) return toast.error("Name is required");
                if (!editing.recipients?.length) return toast.error("Add at least one recipient");
                saveMut.mutate({
                  id: editing.id,
                  name: editing.name!.trim(),
                  report_type: editing.report_type,
                  format: editing.format,
                  cadence: editing.cadence,
                  day_of_week: editing.cadence === "weekly" ? editing.day_of_week ?? 1 : null,
                  day_of_month: editing.cadence === "monthly" ? editing.day_of_month ?? 1 : null,
                  hour_utc: editing.hour_utc ?? 13,
                  recipients: editing.recipients,
                  enabled: editing.enabled ?? true,
                });
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
