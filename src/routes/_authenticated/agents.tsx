import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useState, useRef } from "react";
import { Search, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { parseCsv, toCsv, downloadCsv } from "@/lib/csv";
import { importAgents } from "@/lib/bulk-operations.functions";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/agents")({
  component: AgentsPage,
});

const TEMPLATE_HEADERS = [
  "employee_id", "full_name", "email", "department",
  "team", "manager_name", "joining_date", "qa_score", "status",
];

function AgentsPage() {
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").order("full_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filtered = data.filter((a) =>
    !q || [a.full_name, a.employee_id, a.email, a.department, a.team].some((f) => f?.toLowerCase().includes(q.toLowerCase()))
  );

  const downloadTemplate = () => {
    const csv = toCsv([{
      employee_id: "EMP001", full_name: "Jane Doe", email: "jane@example.com",
      department: "Support", team: "Tier 1", manager_name: "Alex Smith",
      joining_date: "2024-01-15", qa_score: "85", status: "active",
    }], TEMPLATE_HEADERS);
    downloadCsv("agents-import-template.csv", csv);
  };

  const exportAgents = () => {
    if (data.length === 0) { toast.error("No agents to export"); return; }
    const csv = toCsv(data.map((a) => ({
      employee_id: a.employee_id, full_name: a.full_name, email: a.email,
      department: a.department, team: a.team ?? "", manager_name: a.manager_name ?? "",
      joining_date: a.joining_date ?? "", qa_score: a.qa_score, status: a.status,
    })), TEMPLATE_HEADERS);
    downloadCsv(`agents-${format(new Date(), "yyyyMMdd-HHmm")}.csv`, csv);
    toast.success(`Exported ${data.length} agent(s)`);
  };

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle={`${data.length} team members`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents…" className="h-8 w-64 pl-8 text-sm" />
            </div>
            <Button size="sm" variant="outline" onClick={exportAgents}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
            <Button size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Import CSV
            </Button>
          </div>
        }
      />
      <div className="mx-auto max-w-7xl px-8 pb-12 pt-6">
        <Card className="overflow-hidden rounded-xl border-border/60 bg-card/60">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Department</th>
                <th className="px-4 py-2.5 font-medium">Team</th>
                <th className="px-4 py-2.5 font-medium">Manager</th>
                <th className="px-4 py-2.5 font-medium text-right">Quality Score</th>
                <th className="px-4 py-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-border/40 last:border-0" aria-busy="true">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted/40 animate-pulse" />
                      <div className="space-y-1.5">
                        <div className="h-3 w-32 bg-muted/40 rounded animate-pulse" />
                        <div className="h-2.5 w-40 bg-muted/30 rounded animate-pulse" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><div className="h-3 w-20 bg-muted/40 rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-16 bg-muted/40 rounded animate-pulse" /></td>
                  <td className="px-4 py-3"><div className="h-3 w-24 bg-muted/40 rounded animate-pulse" /></td>
                  <td className="px-4 py-3 text-right"><div className="ml-auto h-4 w-10 bg-muted/40 rounded animate-pulse" /></td>
                  <td className="px-4 py-3 text-right"><div className="ml-auto h-3 w-12 bg-muted/40 rounded animate-pulse" /></td>
                </tr>
              ))}
              {filtered.map((a) => {
                const initials = (a.full_name ?? "?").split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
                const score = a.qa_score == null ? null : Number(a.qa_score);
                return (
                <tr key={a.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-[11px] font-medium text-primary">
                        {initials}
                      </div>
                      <div>
                        <Link to="/feedback/new" search={{ agent: a.id }} className="font-medium hover:underline">{a.full_name}</Link>
                        <div className="text-xs text-muted-foreground">{a.employee_id} · {a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.department}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.team ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.manager_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {score == null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                    <span className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                      score >= 90 ? "bg-[oklch(0.72_0.16_160)]/15 text-[oklch(0.72_0.16_160)]" :
                      score >= 75 ? "bg-primary/15 text-primary" :
                      "bg-destructive/15 text-destructive"
                    )}>
                      {score.toFixed(1)}
                    </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        a.status === "active" ? "bg-[oklch(0.72_0.16_160)]" : "bg-muted-foreground/50"
                      )} />
                      {a.status}
                    </span>
                  </td>
                </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                  {data.length === 0 ? "No agents yet. Import a CSV to get started." : `No agents match “${q}”.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={() => qc.invalidateQueries({ queryKey: ["agents"] })}
        onDownloadTemplate={downloadTemplate}
      />
    </div>
  );
}

function ImportDialog({ open, onOpenChange, onDone, onDownloadTemplate }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  onDownloadTemplate: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<{ inserted: number; errors: Array<{ row: number; error: string }> } | null>(null);
  const importFn = useServerFn(importAgents);

  const mut = useMutation({
    mutationFn: () => importFn({ data: { rows: preview ?? [] } }),
    onSuccess: (r) => {
      setResult({ inserted: r.inserted, errors: r.errors });
      if (r.errors.length === 0) {
        toast.success(`Imported ${r.inserted} agent(s)`);
        onDone();
      } else {
        toast.warning(`Imported ${r.inserted}, ${r.errors.length} row(s) failed`);
        onDone();
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Import failed"),
  });

  const reset = () => {
    setPreview(null); setFileName(""); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { toast.error("CSV appears empty"); return; }
    if (rows.length > 2000) { toast.error("Max 2000 rows per import"); return; }
    setPreview(rows);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import agents from CSV</DialogTitle>
          <DialogDescription>
            Upsert by <code className="text-xs">employee_id</code>. Required columns: employee_id, full_name, email, department.
          </DialogDescription>
        </DialogHeader>

        {!preview && !result && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-border/60 bg-card/40 px-6 py-10 text-center transition hover:border-primary/60 hover:bg-primary/5"
            >
              <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-2 text-sm font-medium">Click to select a CSV file</div>
              <div className="mt-1 text-xs text-muted-foreground">Up to 2000 rows</div>
            </button>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Need the template?</span>
              <Button size="sm" variant="ghost" onClick={onDownloadTemplate}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download template
              </Button>
            </div>
          </div>
        )}

        {preview && !result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground">{preview.length} row(s) detected</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {Object.keys(preview[0] ?? {}).map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-border/40">
                      {Object.keys(preview[0] ?? {}).map((h) => (
                        <td key={h} className="px-2 py-1 text-muted-foreground">{r[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 8 && (
                <div className="border-t border-border/40 bg-muted/20 px-2 py-1 text-center text-[10px] text-muted-foreground">
                  + {preview.length - 8} more row(s)
                </div>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/30 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Successfully upserted <strong>{result.inserted}</strong> agent(s).
            </div>
            {result.errors.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-destructive mb-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {result.errors.length} row(s) failed
                </div>
                <div className="max-h-40 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs space-y-1">
                  {result.errors.slice(0, 30).map((e, i) => (
                    <div key={i}><span className="font-mono">Row {e.row}:</span> <span className="text-muted-foreground">{e.error}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {preview && !result && (
            <>
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? "Importing…" : `Import ${preview.length} row(s)`}
              </Button>
            </>
          )}
          {result && <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
