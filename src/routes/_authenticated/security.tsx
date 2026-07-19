import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ShieldAlert, Users, Mail, Activity, KeyRound, Lock, RefreshCw } from "lucide-react";
import { getSecurityOverview } from "@/lib/security.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [{ title: "Security · Zenwork Performance Manager" }] }),
  component: SecurityPage,
});

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2">
      {ok ? (
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
      ) : (
        <ShieldAlert className="h-4 w-4 text-amber-500" />
      )}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function SecurityPage() {
  const fetchOverview = useServerFn(getSecurityOverview);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["security-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 30_000,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Security overview
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Posture, recent activity, and enforcement for Zenwork Performance Manager.
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Posture */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Enforcement posture</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <StatusPill ok={!!data?.posture.hstsEnabled} label="HSTS + security headers" />
          <StatusPill ok={!!data?.posture.cspEnabled} label="Content Security Policy" />
          <StatusPill ok={!!data?.posture.rlsEnforced} label="Row-level security" />
          <StatusPill ok={!!data?.posture.mfaAvailable} label="MFA (TOTP) available" />
          <StatusPill ok={!!data?.posture.hibpEnabled} label="Breached-password check" />
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Users className="h-3.5 w-3.5" />Total users</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{isLoading ? "—" : data?.userCount ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><KeyRound className="h-3.5 w-3.5" />Role assignments</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{Object.values(data?.roleCounts ?? {}).reduce((a, b) => a + b, 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Mail className="h-3.5 w-3.5" />Email failures</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-semibold ${(data?.email.failed ?? 0) > 0 ? "text-amber-500" : ""}`}>{data?.email.failed ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Activity className="h-3.5 w-3.5" />Audit events (30d)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{data?.auditLog.length ?? 0}</div></CardContent>
        </Card>
      </div>

      {/* Role distribution */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Role distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data?.roleCounts ?? {}).map(([role, n]) => (
              <Badge key={role} variant="secondary" className="text-xs">
                {role} · {n}
              </Badge>
            ))}
            {(!data?.roleCounts || Object.keys(data.roleCounts).length === 0) && (
              <span className="text-xs text-muted-foreground">No roles assigned yet.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent logins */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4" />Recent authentication events</CardTitle></CardHeader>
        <CardContent>
          {data?.loginError ? (
            <p className="text-xs text-muted-foreground">Auth audit log unavailable in this environment. ({data.loginError})</p>
          ) : (data?.recentLogins ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent events.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 font-medium">Event</th>
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {data!.recentLogins.slice(0, 25).map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{r.event}</Badge></td>
                      <td className="py-1.5 text-muted-foreground">{r.user ?? "—"}</td>
                      <td className="py-1.5 font-mono text-muted-foreground">{r.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold">Feedback audit trail</CardTitle></CardHeader>
        <CardContent>
          {(data?.auditLog ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No audit entries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 font-medium">Action</th>
                    <th className="pb-2 font-medium">Feedback</th>
                    <th className="pb-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {(data!.auditLog as any[]).slice(0, 25).map((r) => (
                    <tr key={r.id}>
                      <td className="py-1.5">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{r.action}</Badge></td>
                      <td className="py-1.5 font-mono text-muted-foreground">{r.feedback_id?.slice(0, 8) ?? "—"}</td>
                      <td className="max-w-md truncate py-1.5 text-muted-foreground">{r.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
