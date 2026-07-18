import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  getEmailSettings,
  saveEmailSettings,
  verifyEmailConnection,
  sendTestEmail,
} from "@/lib/email-settings.functions";
import {
  listEmailQueue,
  emailQueueSummary,
  retryEmail,
  retryAllFailed,
  cancelEmail,
  pauseQueue,
  resumeQueue,
  drainNow,
} from "@/lib/email-queue.functions";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, RefreshCw, PauseCircle, PlayCircle, Send, Zap, Ban, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Email service configuration, queue, and delivery history." />
      <div className="mx-auto max-w-6xl px-8 pb-16 pt-4">
        <Tabs defaultValue="email">
          <TabsList>
            <TabsTrigger value="email">Email configuration</TabsTrigger>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="mt-4"><EmailConfig /></TabsContent>
          <TabsContent value="queue" className="mt-4"><QueueMonitor /></TabsContent>
          <TabsContent value="history" className="mt-4"><EmailHistory /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email configuration tab
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeTimeAgo(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : formatDistanceToNow(d, { addSuffix: true });
}

function EmailConfig() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailSettings);
  const saveFn = useServerFn(saveEmailSettings);
  const verifyFn = useServerFn(verifyEmailConnection);
  const testFn = useServerFn(sendTestEmail);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<any>(null);
  const [testTo, setTestTo] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const s = form ?? settings;

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          provider: s?.provider,
          sender_name: s?.sender_name,
          sender_email: s?.sender_email ?? "",
          reply_to: s?.reply_to ?? "",
          signature_html: s?.signature_html ?? "",
          logo_url: s?.logo_url ?? "",
          confidentiality_notice: s?.confidentiality_notice ?? "",
          enabled: !!s?.enabled,
        },
      }),
    onSuccess: (row) => {
      toast.success("Settings saved");
      setForm(null);
      qc.setQueryData(["email-settings"], row);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const verify = useMutation({
    mutationFn: () => verifyFn(),
    onSuccess: (r: any) => {
      setVerifyResult(r);
      if (r.ok) toast.success(`Connected as ${r.account ?? "provider"}`);
      else toast.error(r.error ?? "Verification failed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Verification failed"),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { to: testTo } }),
    onSuccess: (r: any) => {
      setTestResult(r);
      if (r.ok) toast.success(`Test email sent (${r.latencyMs}ms)`);
      else toast.error(r.error ?? "Send failed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Send failed"),
  });

  if (isLoading || !s) {
    return (
      <Card className="p-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }
  const set = (patch: any) => setForm({ ...s, ...patch });
  const testEmailValid = EMAIL_RE.test(testTo.trim());


  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Email service</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Enable or disable outbound email delivery.</div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs", s.enabled ? "text-primary" : "text-muted-foreground")}>{s.enabled ? "Enabled" : "Disabled"}</span>
            <Switch checked={!!s.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-sm font-semibold">Provider</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Provider</Label>
            <Select value={s.provider} onValueChange={(v) => set({ provider: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gmail">Gmail (OAuth) — Development</SelectItem>
                <SelectItem value="ms_graph" disabled>Microsoft 365 (Graph) — Production (coming soon)</SelectItem>
                <SelectItem value="sendgrid" disabled>SendGrid — Production (coming soon)</SelectItem>
                <SelectItem value="ses" disabled>Amazon SES — Production (coming soon)</SelectItem>
                <SelectItem value="mailgun" disabled>Mailgun — Production (coming soon)</SelectItem>
                <SelectItem value="resend" disabled>Resend — Production (coming soon)</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">Gmail is linked via secure OAuth — no SMTP passwords stored.</p>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => verify.mutate()} disabled={verify.isPending}>
              {verify.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-2 h-3.5 w-3.5" />}
              Verify connection
            </Button>
            {verifyResult && (
              <div className={cn("flex items-center gap-1.5 text-xs", verifyResult.ok ? "text-primary" : "text-destructive")}>
                {verifyResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                <span>{verifyResult.ok ? `Connected · ${verifyResult.account} · ${verifyResult.latencyMs}ms` : verifyResult.error}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-sm font-semibold">Sender identity</div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Sender name</Label>
            <Input className="mt-1.5" value={s.sender_name ?? ""} onChange={(e) => set({ sender_name: e.target.value })} />
          </div>
          <div>
            <Label>Sender email</Label>
            <Input className="mt-1.5" value={s.sender_email ?? ""} onChange={(e) => set({ sender_email: e.target.value })} placeholder="you@gmail.com" />
            <p className="mt-1.5 text-xs text-muted-foreground">Must match the Gmail account you connected.</p>
          </div>
          <div>
            <Label>Reply-To</Label>
            <Input className="mt-1.5" value={s.reply_to ?? ""} onChange={(e) => set({ reply_to: e.target.value })} placeholder="Optional" />
          </div>
          <div>
            <Label>Logo URL</Label>
            <Input className="mt-1.5" value={s.logo_url ?? ""} onChange={(e) => set({ logo_url: e.target.value })} placeholder="https://…" />
          </div>
          <div className="sm:col-span-2">
            <Label>Email signature (HTML)</Label>
            <Textarea className="mt-1.5 font-mono text-xs" rows={4} value={s.signature_html ?? ""} onChange={(e) => set({ signature_html: e.target.value })}
              placeholder="<strong>QA Team</strong><br>Contoso Global Support" />
          </div>
          <div className="sm:col-span-2">
            <Label>Confidentiality notice</Label>
            <Textarea className="mt-1.5" rows={2} value={s.confidentiality_notice ?? ""} onChange={(e) => set({ confidentiality_notice: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form}>
            {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save changes
          </Button>
          {form && <Button variant="ghost" onClick={() => setForm(null)}>Discard</Button>}
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-sm font-semibold">Send test email</div>
        <div className="mt-1 text-xs text-muted-foreground">Verifies the provider connection and delivers a formatted test message.</div>
        <div className="mt-4 flex gap-2">
          <Input placeholder="destination@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button onClick={() => test.mutate()} disabled={test.isPending || !testTo}>
            {test.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
            Send test
          </Button>
        </div>
        {testResult && (
          <div className={cn("mt-3 rounded-md p-3 text-xs", testResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
            <div className="flex items-center gap-2">
              {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              <span className="font-medium">{testResult.ok ? "Delivered" : "Failed"}</span>
              <span className="text-muted-foreground">· {testResult.provider} · {testResult.latencyMs}ms</span>
            </div>
            <div className="mt-1 break-all">{testResult.ok ? `Message ID: ${testResult.messageId ?? "n/a"}` : testResult.error}</div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue monitor tab
// ---------------------------------------------------------------------------
const STATUS_TONE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  sending: "bg-[oklch(0.78_0.16_75)]/15 text-[oklch(0.78_0.16_75)]",
  sent: "bg-primary/15 text-primary",
  failed: "bg-destructive/15 text-destructive",
  paused: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

function QueueMonitor() {
  const qc = useQueryClient();
  const listFn = useServerFn(listEmailQueue);
  const sumFn = useServerFn(emailQueueSummary);
  const retryFn = useServerFn(retryEmail);
  const retryAllFn = useServerFn(retryAllFailed);
  const cancelFn = useServerFn(cancelEmail);
  const pauseFn = useServerFn(pauseQueue);
  const resumeFn = useServerFn(resumeQueue);
  const drainFn = useServerFn(drainNow);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["email-queue"] });
    qc.invalidateQueries({ queryKey: ["email-queue-summary"] });
  };

  const { data: summary = {} } = useQuery({
    queryKey: ["email-queue-summary"],
    queryFn: () => sumFn(),
    refetchInterval: 5000,
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["email-queue"],
    queryFn: () => listFn({ data: { limit: 100 } }),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {["queued", "sending", "sent", "failed", "paused"].map((k) => (
          <Card key={k} className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{(summary as any)[k] ?? 0}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={async () => { await drainFn(); invalidate(); toast.success("Drain triggered"); }}>
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Drain now
          </Button>
          <Button size="sm" variant="outline" onClick={async () => { await retryAllFn(); invalidate(); toast.success("Failed emails requeued"); }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry all failed
          </Button>
          <Button size="sm" variant="outline" onClick={async () => { const r: any = await pauseFn(); invalidate(); toast.success(`Paused ${r.paused ?? 0}`); }}>
            <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> Pause queue
          </Button>
          <Button size="sm" variant="outline" onClick={async () => { const r: any = await resumeFn(); invalidate(); toast.success(`Resumed ${r.resumed ?? 0}`); }}>
            <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Resume queue
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Kind</th>
              <th className="px-4 py-2 text-left">To</th>
              <th className="px-4 py-2 text-left">Subject</th>
              <th className="px-4 py-2 text-right">Attempts</th>
              <th className="px-4 py-2 text-left">Next attempt</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(rows as any[]).map((r) => (
              <tr key={r.id} className="border-t border-border/60">
                <td className="px-4 py-2"><span className={cn("rounded-md px-2 py-0.5 text-xs capitalize", STATUS_TONE[r.status] ?? "bg-muted")}>{r.status}</span></td>
                <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">{r.kind}</td>
                <td className="px-4 py-2">{r.to_email}</td>
                <td className="px-4 py-2 max-w-xs truncate">{r.subject}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.attempts}/{r.max_attempts}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.next_attempt_at ? formatDistanceToNow(new Date(r.next_attempt_at), { addSuffix: true }) : "—"}</td>
                <td className="px-4 py-2 text-right">
                  {(r.status === "failed" || r.status === "paused") && (
                    <Button size="sm" variant="ghost" onClick={async () => { await retryFn({ data: { id: r.id } }); invalidate(); }}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {(r.status === "queued" || r.status === "failed" || r.status === "paused") && (
                    <Button size="sm" variant="ghost" onClick={async () => { await cancelFn({ data: { id: r.id } }); invalidate(); }}>
                      <Ban className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">Queue is empty.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab (all sent/failed messages)
// ---------------------------------------------------------------------------
function EmailHistory() {
  const listFn = useServerFn(listEmailQueue);
  const { data: rows = [] } = useQuery({
    queryKey: ["email-history"],
    queryFn: () => listFn({ data: { limit: 200 } }),
    refetchInterval: 10000,
  });

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">When</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Kind</th>
            <th className="px-4 py-2 text-left">To</th>
            <th className="px-4 py-2 text-left">Subject</th>
            <th className="px-4 py-2 text-left">Provider</th>
            <th className="px-4 py-2 text-left">Error</th>
          </tr>
        </thead>
        <tbody>
          {(rows as any[]).map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              <td className="px-4 py-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</td>
              <td className="px-4 py-2"><span className={cn("rounded-md px-2 py-0.5 text-xs capitalize", STATUS_TONE[r.status] ?? "bg-muted")}>{r.status}</span></td>
              <td className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">{r.kind}</td>
              <td className="px-4 py-2">{r.to_email}</td>
              <td className="px-4 py-2 max-w-sm truncate">{r.subject}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{r.provider ?? "—"}</td>
              <td className="px-4 py-2 max-w-xs truncate text-xs text-destructive">{r.last_error ?? ""}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No history yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
