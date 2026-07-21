import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import {
  listAcknowledgementFeedback,
  getAcknowledgementHistory,
  type AckRow,
} from "@/lib/ack-admin.functions";

export const Route = createFileRoute("/_authenticated/acknowledgements")({
  head: () => ({
    meta: [{ title: "Acknowledgements — QualiPulse" }],
  }),
  component: AcknowledgementsAdmin,
});

type StatusFilter = "all" | "pending" | "acknowledged" | "overdue" | "response_received";

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "response_received", label: "Response received" },
];

function statusTone(s: string | null | undefined): string {
  switch (s) {
    case "acknowledged":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "response_received":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "overdue":
      return "bg-red-50 text-red-700 border-red-200";
    case "pending":
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function fmt(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "MMM d, yyyy p");
}

function ago(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

function AcknowledgementsAdmin() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const list = useServerFn(listAcknowledgementFeedback);
  const query = useQuery({
    queryKey: ["ack-admin", status, q],
    queryFn: () => list({ data: { status, q: q || undefined, limit: 200 } }),
  });

  useRealtimeInvalidate("feedback", [["ack-admin"]]);
  useRealtimeInvalidate("feedback_reminders", [["ack-admin"], ["ack-history"]]);
  useRealtimeInvalidate("feedback_email_responses", [["ack-admin"], ["ack-history"]]);

  const rows: AckRow[] = query.data ?? [];

  const counts = useMemo(() => {
    const c = { pending: 0, overdue: 0, acknowledged: 0, response_received: 0 };
    for (const r of rows) {
      const s = r.acknowledgement_status as keyof typeof c | undefined;
      if (s && s in c) c[s]++;
    }
    return c;
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Acknowledgements"
        subtitle="Track feedback by case number, acknowledgement status, and reminder history."
      />
      <div className="mx-auto max-w-7xl space-y-5 px-6 py-6 sm:px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Pending", value: counts.pending, tone: "text-amber-700" },
            { label: "Overdue", value: counts.overdue, tone: "text-red-700" },
            { label: "Acknowledged", value: counts.acknowledged, tone: "text-emerald-700" },
            { label: "Responses", value: counts.response_received, tone: "text-sky-700" },
          ].map((k) => (
            <Card key={k.label} className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className={cn("mt-1 text-2xl font-semibold", k.tone)}>{k.value}</div>
            </Card>
          ))}
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <Button
                  key={s.value}
                  size="sm"
                  variant={status === s.value ? "default" : "outline"}
                  onClick={() => setStatus(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="ml-auto w-full max-w-xs">
              <Input
                placeholder="Search case number or title…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Case #</th>
                  <th className="px-4 py-2.5">Agent</th>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Ack status</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Reminders</th>
                  <th className="px-4 py-2.5">Last reminder</th>
                  <th className="px-4 py-2.5">Sent</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No feedback matches this filter.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.case_number ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{r.agent_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.agent_email ?? ""}</div>
                      </td>
                      <td className="px-4 py-2.5 max-w-[280px] truncate" title={r.title}>
                        {r.title}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={cn("font-medium", statusTone(r.acknowledgement_status))}>
                          {(r.acknowledgement_status ?? "pending").replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs">{fmt(r.acknowledgement_due_at)}</td>
                      <td className="px-4 py-2.5 text-xs">{r.reminder_count ?? 0}</td>
                      <td className="px-4 py-2.5 text-xs">{ago(r.last_reminder_sent_at)}</td>
                      <td className="px-4 py-2.5 text-xs">{ago(r.sent_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(r.id)}>
                            History
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link to="/feedback/$id" params={{ id: r.id }}>
                              Open
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <HistorySheet feedbackId={selected} onOpenChange={(v) => !v && setSelected(null)} />
    </>
  );
}

function HistorySheet({
  feedbackId,
  onOpenChange,
}: {
  feedbackId: string | null;
  onOpenChange: (v: boolean) => void;
}) {
  const getHistory = useServerFn(getAcknowledgementHistory);
  const q = useQuery({
    queryKey: ["ack-history", feedbackId],
    queryFn: () => getHistory({ data: { feedbackId: feedbackId! } }),
    enabled: !!feedbackId,
  });
  const h = q.data;

  return (
    <Sheet open={!!feedbackId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{h?.feedback.case_number ?? "Case"}</SheetTitle>
          <SheetDescription>{h?.feedback.title ?? ""}</SheetDescription>
        </SheetHeader>

        {q.isLoading || !h ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="mt-4 space-y-6 text-sm">
            <section className="rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Row label="Agent" value={h.feedback.agent_name ?? "—"} />
                <Row label="Status" value={h.feedback.acknowledgement_status ?? "pending"} />
                <Row label="Sent" value={fmt(h.feedback.sent_at)} />
                <Row label="Due" value={fmt(h.feedback.acknowledgement_due_at)} />
                <Row label="Acknowledged" value={fmt(h.feedback.acknowledged_at)} />
                <Row label="Response received" value={fmt(h.feedback.agent_response_received_at)} />
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reminders ({h.reminders.length})
              </h3>
              {h.reminders.length === 0 ? (
                <p className="text-xs text-muted-foreground">No reminders sent.</p>
              ) : (
                <ul className="space-y-2">
                  {h.reminders.map((r) => (
                    <li key={r.id} className="rounded-md border p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Reminder #{r.reminder_number}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.delivery_status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{fmt(r.sent_at)}</div>
                      <div className="mt-1 truncate text-xs" title={r.subject}>
                        {r.subject}
                      </div>
                      {r.failure_reason ? (
                        <div className="mt-1 text-xs text-red-600">{r.failure_reason}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Agent responses ({h.responses.length})
              </h3>
              {h.responses.length === 0 ? (
                <p className="text-xs text-muted-foreground">No inbound replies yet.</p>
              ) : (
                <ul className="space-y-2">
                  {h.responses.map((r) => (
                    <li key={r.id} className="rounded-md border p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{r.sender_email}</span>
                        <span className="text-muted-foreground">{fmt(r.received_at)}</span>
                      </div>
                      <div className="mt-1 truncate text-xs" title={r.subject}>
                        {r.subject}
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground line-clamp-6">
                        {r.message_body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Email events
              </h3>
              {h.events.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events recorded.</p>
              ) : (
                <ul className="space-y-1">
                  {h.events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{e.event_type}</span>
                      <span className="text-muted-foreground">{ago(e.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
