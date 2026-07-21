import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, FileDown, Loader2, CheckCircle2, XCircle, Ban, Clock } from "lucide-react";
import { listMyExports, getExportDownloadUrl, cancelExport } from "@/lib/export-jobs.functions";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Job = {
  id: string;
  kind: string;
  label: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "canceled";
  progress: number;
  total: number | null;
  row_count: number | null;
  file_name: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

function StatusIcon({ status }: { status: Job["status"] }) {
  switch (status) {
    case "queued":
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    case "processing":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "canceled":
      return <Ban className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function ExportsMenu() {
  const list = useServerFn(listMyExports);
  const downloadFn = useServerFn(getExportDownloadUrl);
  const cancelFn = useServerFn(cancelExport);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const seenCompletedRef = useState(() => new Set<string>())[0];

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ["my-exports"],
    queryFn: () => list() as any,
    refetchInterval: (q) => {
      const rows = (q.state.data as Job[] | undefined) ?? [];
      return rows.some((r) => r.status === "queued" || r.status === "processing") ? 2000 : false;
    },
  });

  useRealtimeInvalidate("export_jobs", [["my-exports"]]);

  // Toast on completion (first sighting only)
  useEffect(() => {
    for (const j of jobs) {
      if ((j.status === "completed" || j.status === "failed") && !seenCompletedRef.has(j.id)) {
        seenCompletedRef.add(j.id);
        if (j.status === "completed") {
          toast.success("Export ready", {
            description: `${j.label ?? "Your export"} · ${j.row_count ?? 0} rows`,
            action: {
              label: "Download",
              onClick: () => handleDownload(j.id),
            },
          });
        } else {
          toast.error("Export failed", { description: j.error ?? "Unknown error" });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "processing");

  async function handleDownload(id: string) {
    try {
      const res: any = await downloadFn({ data: { id } });
      if (res?.url) window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error("Unable to download", { description: e?.message ?? "" });
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["my-exports"] });
    } catch (e: any) {
      toast.error("Unable to cancel", { description: e?.message ?? "" });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-secondary/30 text-muted-foreground transition-colors hover:bg-secondary/60"
          aria-label="Exports"
        >
          {active.length ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          {active.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {active.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b px-3 py-2.5">
          <div className="text-sm font-semibold">Exports</div>
          <div className="text-[11px] text-muted-foreground">
            Background CSV jobs. Ready files are available for 15 minutes.
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {!jobs.length ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              No exports yet. Trigger one from a report page.
            </div>
          ) : (
            jobs.map((j) => (
              <div key={j.id} className="border-b border-border/50 px-3 py-2.5 last:border-b-0">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5"><StatusIcon status={j.status} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[13px] font-medium">{j.label ?? j.kind}</div>
                      <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[9px] uppercase tracking-wide">
                        {j.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                      {j.row_count != null && <> · {j.row_count} rows</>}
                    </div>
                    {(j.status === "processing" || j.status === "queued") && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={j.status === "queued" ? 2 : j.progress} className="h-1.5 flex-1" />
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {j.status === "queued" ? "queued" : `${j.progress}%`}
                        </span>
                      </div>
                    )}
                    {j.status === "failed" && j.error && (
                      <div className="mt-1 text-[10.5px] text-destructive">{j.error}</div>
                    )}
                    <div className="mt-1.5 flex gap-2">
                      {j.status === "completed" && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => handleDownload(j.id)}>
                          <Download className="mr-1 h-3 w-3" /> Download
                        </Button>
                      )}
                      {j.status === "queued" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => handleCancel(j.id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
