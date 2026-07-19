import { createFileRoute } from "@tanstack/react-router";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
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
  sendBrandingTestEmail,
  saveFeedbackTemplate,
  previewFeedbackTemplate,
  sendFeedbackTemplateTest,
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
import { FEEDBACK_TEMPLATE_VARIABLES } from "@/lib/feedback-email.variables";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, RefreshCw, PauseCircle, PlayCircle, Send, Zap, Ban, Loader2, Clock, Eye, Code2, ShieldCheck, Stethoscope, ChevronDown, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  useRealtimeInvalidate("email_queue", [["email-queue"], ["email-queue-summary"]]);
  return (
    <div>
      <PageHeader title="Settings" subtitle="Email service configuration, queue, and delivery history." />
      <div className="mx-auto max-w-6xl px-8 pb-16 pt-4">
        <Tabs defaultValue="email">
          <TabsList>
            <TabsTrigger value="email">Email configuration</TabsTrigger>
            <TabsTrigger value="template">Feedback template</TabsTrigger>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="mt-4"><EmailConfig /></TabsContent>
          <TabsContent value="template" className="mt-4"><FeedbackTemplateEditor /></TabsContent>
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
  const brandingTestFn = useServerFn(sendBrandingTestEmail);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<any>(null);
  const [testTo, setTestTo] = useState("");
  const [brandingTo, setBrandingTo] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [brandingResult, setBrandingResult] = useState<any>(null);

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
          dev_override_enabled: !!s?.dev_override_enabled,
          dev_override_recipient: s?.dev_override_recipient ?? "",
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

  const brandingTest = useMutation({
    mutationFn: () => brandingTestFn({ data: { to: brandingTo } }),
    onSuccess: (r: any) => {
      setBrandingResult(r);
      if (r.ok) toast.success(`Branding preview sent (${r.latencyMs}ms)`);
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
  const brandingEmailValid = EMAIL_RE.test(brandingTo.trim());


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

      <ProviderCard
        s={s}
        set={set}
        verify={verify}
        verifyResult={verifyResult}
      />


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
              placeholder="<strong>Customer Success Team</strong><br>Contoso Global Support" />
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

        <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Send test email</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Delivers the current Zenwork feedback template with sample data and the logo above so you can preview branding in a real inbox. Save changes first if you edited anything.
              </div>
            </div>
            {s.logo_url ? (
              <img src={s.logo_url} alt="Logo preview" className="h-8 w-auto rounded bg-white p-1" />
            ) : null}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="destination@example.com"
              value={brandingTo}
              onChange={(e) => setBrandingTo(e.target.value)}
            />
            <Button
              onClick={() => brandingTest.mutate()}
              disabled={brandingTest.isPending || !brandingEmailValid || !!form}
              title={form ? "Save changes first" : undefined}
            >
              {brandingTest.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-2 h-3.5 w-3.5" />
              )}
              Send test email
            </Button>
          </div>
          {brandingResult && (
            <div
              className={cn(
                "mt-3 rounded-md p-3 text-xs",
                brandingResult.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
              )}
            >
              <div className="flex items-center gap-2">
                {brandingResult.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                <span className="font-medium">{brandingResult.ok ? "Delivered" : "Failed"}</span>
                <span className="text-muted-foreground">
                  · {brandingResult.provider} · {brandingResult.latencyMs}ms
                </span>
              </div>
              <div className="mt-1 break-all">
                {brandingResult.ok
                  ? `Message ID: ${brandingResult.messageId ?? "n/a"}`
                  : brandingResult.error}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6 border-amber-500/40">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-amber-500">Development email override</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              When enabled, every outbound email — feedback, coaching, reminders, approvals, reports —
              is redirected to the test inbox below. The intended recipient is preserved in delivery logs
              and shown in the subject prefix. Disable before production.
            </div>
          </div>
          <Switch
            checked={!!s.dev_override_enabled}
            onCheckedChange={(v) => set({ dev_override_enabled: v })}
          />
        </div>
        <div className="mt-4">
          <Label>Redirect all mail to</Label>
          <Input
            className="mt-1.5"
            value={s.dev_override_recipient ?? ""}
            onChange={(e) => set({ dev_override_recipient: e.target.value })}
            placeholder="Iamjagadishkumar@gmail.com"
            disabled={!s.dev_override_enabled}
          />
        </div>
      </Card>

      <Card className="p-6">

        <div className="text-sm font-semibold">Send test email</div>
        <div className="mt-1 text-xs text-muted-foreground">Verifies the provider connection and delivers a formatted test message.</div>
        <div className="mt-4 flex gap-2">
          <Input placeholder="destination@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button onClick={() => test.mutate()} disabled={test.isPending || !testEmailValid}>
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
// Provider card — persistent connected-state pill + optional diagnostic
// ---------------------------------------------------------------------------
const LAST_VERIFIED_KEY = "zenwork.email.lastVerifiedAt";

function ProviderCard({
  s,
  set,
  verify,
  verifyResult,
}: {
  s: any;
  set: (patch: any) => void;
  verify: { mutate: () => void; isPending: boolean };
  verifyResult: any;
}) {
  const testFn = useServerFn(sendTestEmail);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(LAST_VERIFIED_KEY);
  });
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagTestTo, setDiagTestTo] = useState("");
  const [diagTestResult, setDiagTestResult] = useState<any>(null);
  const diagTestEmailValid = EMAIL_RE.test(diagTestTo.trim());
  const diagTest = useMutation({
    mutationFn: () => testFn({ data: { to: diagTestTo.trim() } }),
    onSuccess: (r: any) => {
      setDiagTestResult(r);
      if (r.ok) toast.success(`Test email sent (${r.latencyMs}ms)`);
      else toast.error(r.error ?? "Send failed");
    },
    onError: (e: any) => {
      setDiagTestResult({ ok: false, error: e?.message ?? "Send failed" });
      toast.error(e?.message ?? "Send failed");
    },
  });

  // Cache last successful verification so the pill survives page reloads.
  useEffect(() => {
    if (verifyResult?.ok) {
      const iso = new Date().toISOString();
      setLastVerifiedAt(iso);
      try { window.localStorage.setItem(LAST_VERIFIED_KEY, iso); } catch { /* ignore */ }
    }
  }, [verifyResult]);

  const account = verifyResult?.ok ? verifyResult.account : s?.sender_email;
  const isGmail = s.provider === "gmail";
  // Optimistic: treat the connection as connected whenever email service is on
  // and a Gmail account is configured. Verification is diagnostic only.
  const showConnected = isGmail && !!account && !!s.enabled && (!verifyResult || verifyResult.ok);
  const showFailure = verifyResult && !verifyResult.ok;

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Provider</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Gmail is linked once via secure OAuth at the workspace level. No sign-in is required per session.
          </div>
        </div>
        {showConnected && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Connected
          </span>
        )}
        {showFailure && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            Attention
          </span>
        )}
      </div>

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
          <p className="mt-1.5 text-xs text-muted-foreground">Tokens are refreshed automatically — no SMTP passwords stored.</p>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="text-xs font-medium text-muted-foreground">Sending as</div>
          <div className="mt-1 truncate text-sm font-medium">{account || "—"}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Last verified {safeTimeAgo(lastVerifiedAt)}</span>
          </div>
        </div>
      </div>

      {showFailure && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Diagnostic reported an issue</div>
            <div className="mt-0.5 opacity-90">{verifyResult.error}</div>
            <div className="mt-1 opacity-80">
              This does not sign you out. Emails continue to attempt delivery; the queue will surface any real send failures.
            </div>
          </div>
        </div>
      )}

      <Collapsible open={diagOpen} onOpenChange={setDiagOpen} className="mt-4">
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
              <Stethoscope className="h-3.5 w-3.5" />
              Advanced diagnostics
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", diagOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-3">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="text-xs font-medium">Optional connection check</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Runs a read-only Gmail profile call through the OAuth gateway to confirm token freshness and API reachability.
              This is a diagnostic — you don't need to run it before sending email, and it never triggers a reconnection.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
                {verify.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-2 h-3.5 w-3.5" />}
                Run diagnostic
              </Button>
              {verifyResult?.ok && (
                <span className="inline-flex items-center gap-1.5 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  OK · {verifyResult.account} · {verifyResult.latencyMs}ms
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="text-xs font-medium">Send test email</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sends a live test through the cached provider sender ({s?.sender_email || "—"}).
              Reports the raw provider response — success, latency, and message ID, or the exact failure reason.
              Does not modify settings or trigger a reconnection.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="destination@example.com"
                value={diagTestTo}
                onChange={(e) => setDiagTestTo(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => diagTest.mutate()}
                disabled={diagTest.isPending || !diagTestEmailValid || !s?.enabled}
                title={!s?.enabled ? "Enable email service to send" : undefined}
              >
                {diagTest.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-2 h-3.5 w-3.5" />
                )}
                Send test email
              </Button>
            </div>
            {diagTestResult && (
              <div
                className={cn(
                  "mt-3 rounded-md p-3 text-xs",
                  diagTestResult.ok
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                <div className="flex items-center gap-2">
                  {diagTestResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  <span className="font-medium">
                    {diagTestResult.ok ? "Delivered" : "Failed"}
                  </span>
                  {typeof diagTestResult.latencyMs === "number" && (
                    <span className="text-muted-foreground">· {diagTestResult.latencyMs}ms</span>
                  )}
                  {diagTestResult.provider && (
                    <span className="text-muted-foreground">· {diagTestResult.provider}</span>
                  )}
                </div>
                <div className="mt-1 break-all">
                  {diagTestResult.ok
                    ? `Message ID: ${diagTestResult.messageId ?? "n/a"}`
                    : diagTestResult.error}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
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
                <td className="px-4 py-2 text-xs text-muted-foreground">{safeTimeAgo(r.next_attempt_at)}</td>
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
              <td className="px-4 py-2 text-xs text-muted-foreground">{safeTimeAgo(r.created_at)}</td>
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

// ---------------------------------------------------------------------------
// Feedback email template editor
// ---------------------------------------------------------------------------
const DEFAULT_HTML = `<div style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:640px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 8px;font-size:20px;">{{title}}</h2>
  <p style="color:#71717a;margin:0 0 20px;">Prepared for {{agentName}} · Category: {{category}} · Severity: {{severity}}</p>

  <h3 style="margin:16px 0 6px;font-size:14px;">Summary</h3>
  <p>{{summary}}</p>

  <h3 style="margin:16px 0 6px;font-size:14px;">Strengths</h3>
  <p>{{strengths}}</p>

  <h3 style="margin:16px 0 6px;font-size:14px;">Areas to improve</h3>
  <p>{{improvements}}</p>

  <h3 style="margin:16px 0 6px;font-size:14px;">Coaching actions</h3>
  <p>{{recommendedActions}}</p>

  <p style="margin-top:24px;">Please acknowledge by <strong>{{dueDate}}</strong>.</p>
  <p><a href="{{acknowledgeUrl}}" style="display:inline-block;padding:10px 16px;background:#18181b;color:#fff;text-decoration:none;border-radius:6px;">Acknowledge feedback</a></p>

  <p style="color:#a1a1aa;font-size:12px;margin-top:24px;">— {{senderName}}</p>
</div>`;

const DEFAULT_SUBJECT = "New Customer Success feedback: {{title}}";
const DEFAULT_TEXT = `{{title}}

Agent: {{agentName}}
Category: {{category}} · Severity: {{severity}}

Summary:
{{summary}}

Please acknowledge: {{acknowledgeUrl}}`;

function FeedbackTemplateEditor() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailSettings);
  const saveFn = useServerFn(saveFeedbackTemplate);
  const previewFn = useServerFn(previewFeedbackTemplate);
  const testFn = useServerFn(sendFeedbackTemplateTest);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => getFn(),
  });

  const [subject, setSubject] = useState<string>("");
  const [html, setHtml] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(false);
  const [initialized, setInitialized] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<"rendered" | "source">("rendered");
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [focusField, setFocusField] = useState<"subject" | "html" | "text">("html");

  // Prime local state once from server settings.
  if (settings && !initialized) {
    setSubject((settings as any).feedback_template_subject ?? DEFAULT_SUBJECT);
    setHtml((settings as any).feedback_template_html ?? DEFAULT_HTML);
    setText((settings as any).feedback_template_text ?? DEFAULT_TEXT);
    setEnabled(!!(settings as any).feedback_template_enabled);
    setInitialized(true);
  }

  const doPreview = async () => {
    try {
      const r = await previewFn({ data: { subject, html, text } });
      setPreview(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Preview failed");
    }
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          feedback_template_subject: subject,
          feedback_template_html: html,
          feedback_template_text: text || null,
          feedback_template_enabled: enabled,
        },
      }),
    onSuccess: (row) => {
      qc.setQueryData(["email-settings"], row);
      toast.success("Template saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const test = useMutation({
    mutationFn: () =>
      testFn({
        data: {
          to: testTo.trim(),
          subject,
          html,
          text: text || null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        },
      }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["email-queue"] });
      qc.invalidateQueries({ queryKey: ["email-queue-summary"] });
      if (r?.scheduled) {
        toast.success(`Test email scheduled for ${new Date(r.nextAttemptAt).toLocaleString()}`);
      } else if (r?.ok) {
        toast.success(`Test sent (${r.latencyMs}ms)`);
      } else {
        toast.error(r?.error ?? "Test send failed");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Test send failed"),
  });

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    if (focusField === "subject") {
      const el = subjectRef.current;
      if (!el) { setSubject((v) => v + token); return; }
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
      return;
    }
    if (focusField === "text") {
      const el = textRef.current;
      if (!el) { setText((v) => v + token); return; }
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      setText(text.slice(0, start) + token + text.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
      return;
    }
    const el = htmlRef.current;
    if (!el) { setHtml((v) => v + token); return; }
    const start = el.selectionStart ?? html.length;
    const end = el.selectionEnd ?? html.length;
    setHtml(html.slice(0, start) + token + html.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };

  if (isLoading || !initialized) {
    return <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></Card>;
  }

  const scheduleValid = !scheduledAt || !isNaN(new Date(scheduledAt).getTime());
  const canTest = EMAIL_RE.test(testTo.trim()) && subject.trim().length > 0 && html.trim().length > 0 && scheduleValid;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Custom template</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                When enabled, feedback emails render from this template instead of the built-in one. Use <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{`{{variable}}`}</code> tokens.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("text-xs", enabled ? "text-primary" : "text-muted-foreground")}>{enabled ? "Active" : "Using default"}</span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <Label>Subject line</Label>
            <Input
              ref={subjectRef}
              className="mt-1.5 font-mono text-xs"
              value={subject}
              onFocus={() => setFocusField("subject")}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={DEFAULT_SUBJECT}
              maxLength={300}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>HTML body</Label>
              <span className="text-[11px] text-muted-foreground">{html.length.toLocaleString()} chars</span>
            </div>
            <Textarea
              ref={htmlRef}
              className="mt-1.5 font-mono text-xs"
              rows={18}
              value={html}
              onFocus={() => setFocusField("html")}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div>
            <Label>Plain-text fallback (optional)</Label>
            <Textarea
              ref={textRef}
              className="mt-1.5 font-mono text-xs"
              rows={6}
              value={text}
              onFocus={() => setFocusField("text")}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save template
            </Button>
            <Button variant="outline" onClick={doPreview}>
              <Eye className="mr-2 h-3.5 w-3.5" /> Refresh preview
            </Button>
            <Button variant="ghost" onClick={() => { setSubject(DEFAULT_SUBJECT); setHtml(DEFAULT_HTML); setText(DEFAULT_TEXT); }}>
              Reset to defaults
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-semibold">Send a test</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Renders the current template with sample data. Leave the schedule blank to send immediately.</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <div>
              <Label className="text-xs">Recipient</Label>
              <Input className="mt-1" placeholder="destination@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Schedule (optional)</Label>
              <Input className="mt-1" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => test.mutate()} disabled={test.isPending || !canTest} className="w-full">
                {test.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : (scheduledAt ? <Clock className="mr-2 h-3.5 w-3.5" /> : <Send className="mr-2 h-3.5 w-3.5" />)}
                {scheduledAt ? "Schedule" : "Send now"}
              </Button>
            </div>
          </div>
          {scheduledAt && !scheduleValid && (
            <div className="mt-2 text-xs text-destructive">Invalid schedule time.</div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</div>
            <div className="flex gap-1">
              <Button size="sm" variant={previewMode === "rendered" ? "secondary" : "ghost"} onClick={() => setPreviewMode("rendered")}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant={previewMode === "source" ? "secondary" : "ghost"} onClick={() => setPreviewMode("source")}>
                <Code2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <TemplatePreview subject={subject} html={html} text={text} preview={preview} mode={previewMode} onRefresh={doPreview} />
        </Card>
      </div>

      <Card className="p-4 h-fit lg:sticky lg:top-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Insert variable</div>
        <p className="mt-1 text-[11px] text-muted-foreground">Click a variable to insert it into the last-focused field ({focusField}).</p>
        <div className="mt-3 space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
          {FEEDBACK_TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVariable(v.key)}
              className="w-full rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-left hover:border-primary hover:bg-primary/5 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-[11px] font-medium text-primary">{`{{${v.key}}}`}</code>
                <span className="text-[10px] text-muted-foreground">{v.label}</span>
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-2">{v.description}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TemplatePreview({
  subject, html, text, preview, mode, onRefresh,
}: {
  subject: string; html: string; text: string;
  preview: { subject: string; html: string; text: string } | null;
  mode: "rendered" | "source";
  onRefresh: () => void;
}) {
  // Auto-refresh preview when inputs change (debounced).
  const timer = useRef<any>(null);
  if (timer.current) clearTimeout(timer.current);
  timer.current = setTimeout(() => { if (!preview || preview.subject !== subject || preview.html !== html || preview.text !== text) onRefresh(); }, 400);

  if (!preview) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Rendering preview…</div>;
  }

  if (mode === "source") {
    return (
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Subject</div>
        <pre className="mt-1 rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">{preview.subject}</pre>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">HTML</div>
        <pre className="mt-1 rounded-md bg-muted/40 p-3 font-mono text-[11px] whitespace-pre-wrap break-all max-h-96 overflow-auto">{preview.html}</pre>
        <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Text</div>
        <pre className="mt-1 rounded-md bg-muted/40 p-3 font-mono text-[11px] whitespace-pre-wrap max-h-64 overflow-auto">{preview.text || "—"}</pre>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-border/60 px-4 py-2 text-xs">
        <span className="font-semibold text-muted-foreground">Subject:</span> <span>{preview.subject}</span>
      </div>
      <iframe
        title="Email preview"
        sandbox=""
        srcDoc={`<!doctype html><html><body style="margin:0;background:#fafafa;">${preview.html}</body></html>`}
        className="w-full min-h-[560px] bg-white"
      />
    </div>
  );
}
