import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAgent, listMyFeedback } from "@/lib/agent-portal.functions";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { SkeletonBox } from "@/components/ui/skeleton-blocks";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

function safeTimeAgo(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : formatDistanceToNow(d, { addSuffix: true });
}


export const Route = createFileRoute("/_authenticated/portal")({
  component: PortalPage,
});

const STATUS_TONE: Record<string, string> = {
  sent: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
  acknowledged: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
  completed: "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]",
};

const SEV_TONE: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-[oklch(0.78_0.16_75)]",
  critical: "text-destructive",
};

function PortalPage() {
  const fetchAgent = useServerFn(getMyAgent);
  const fetchList = useServerFn(listMyFeedback);

  const { data: agent } = useQuery({ queryKey: ["my-agent"], queryFn: () => fetchAgent() });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["my-feedback"],
    queryFn: () => fetchList(),
  });

  const pending = rows.filter((r) => r.status === "sent").length;
  const acked = rows.filter((r) => r.status === "acknowledged" || r.status === "completed").length;

  return (
    <div>
      <PageHeader
        title="My feedback"
        subtitle={
          agent
            ? [agent.full_name, agent.department].filter(Boolean).join(" · ") ||
              "Your personal quality feedback"
            : "Your personal quality feedback"
        }

      <div className="mx-auto max-w-5xl px-8 pb-12 pt-6 animate-in fade-in duration-300 space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard icon={AlertCircle} tone="warn" label="Awaiting acknowledgement" value={pending} />
          <StatCard icon={CheckCircle2} tone="ok" label="Acknowledged" value={acked} />
          <StatCard icon={Clock} tone="neutral" label="Total received" value={rows.length} />
        </div>

        <Card className="overflow-hidden rounded-xl border-border/60 bg-card/60">
          <div className="border-b border-border/60 px-4 py-3">
            <div className="text-sm font-medium">Feedback timeline</div>
            <div className="text-xs text-muted-foreground">Only feedback sent to you appears here.</div>
          </div>

          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBox key={i} className="h-14 w-full" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              You have no feedback yet.
            </div>
          )}

          {!isLoading && rows.length > 0 && (
            <div>
              {rows.map((f) => (
                <Link
                  key={f.id}
                  to="/portal/$id"
                  params={{ id: f.id }}
                  className="flex items-center gap-3 border-b border-border/40 px-4 py-3 text-sm transition-colors last:border-0 hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{f.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{f.category}</span>
                      <span className="capitalize">{f.feedback_type}</span>
                      <span className={cn("capitalize", SEV_TONE[f.severity as string])}>
                        {f.severity}
                      </span>
                      {f.score != null && <span>Score {f.score}</span>}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize",
                      STATUS_TONE[f.status as string],
                    )}
                  >
                    {f.status}
                  </span>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {f.sent_at
                      ? formatDistanceToNow(new Date(f.sent_at), { addSuffix: true })
                      : "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: any;
  tone: "warn" | "ok" | "neutral";
  label: string;
  value: number;
}) {
  const toneClass =
    tone === "warn"
      ? "text-[oklch(0.78_0.16_75)] bg-[oklch(0.78_0.16_75)]/10"
      : tone === "ok"
        ? "text-[oklch(0.72_0.16_160)] bg-[oklch(0.72_0.16_160)]/10"
        : "text-muted-foreground bg-muted";
  return (
    <Card className="flex items-center gap-3 rounded-xl border-border/60 bg-card/60 p-4">
      <div className={cn("grid h-9 w-9 place-items-center rounded-lg", toneClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tracking-tight">{value}</div>
      </div>
    </Card>
  );
}
