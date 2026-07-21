import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Search, UserPlus, MoreHorizontal, Shield, Copy, ShieldOff, CheckCircle2, RefreshCw } from "lucide-react";
import {
  listAuthorisedUsers, inviteUser, updateAccessStatus, updateUserRole, resendInvitation, listAccessAudit,
} from "@/lib/access-control.functions";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/access-management")({
  component: AccessManagementPage,
});

const ROLE_LABELS: Record<string, string> = {
  master_admin: "Master Admin",
  admin: "Admin",
  qa_evaluator: "QA Evaluator",
  manager: "Manager",
  viewer: "Viewer",
  agent: "Agent",
  super_admin: "Super Admin",
  qa_admin: "QA Admin (legacy)",
  team_manager: "Team Manager (legacy)",
  read_only: "Read-only (legacy)",
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  invited: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  suspended: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  revoked: "bg-destructive/15 text-destructive border-destructive/30",
};

function AccessManagementPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAuthorisedUsers);
  const auditFn = useServerFn(listAccessAudit);
  const inviteFn = useServerFn(inviteUser);
  const statusFn = useServerFn(updateAccessStatus);
  const roleFn = useServerFn(updateUserRole);
  const resendFn = useServerFn(resendInvitation);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["authorised-users"],
    queryFn: () => listFn(),
    retry: false,
  });
  const { data: audit = [] } = useQuery({
    queryKey: ["access-audit"],
    queryFn: () => auditFn(),
    retry: false,
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (users as any[]).filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (s && !`${u.email} ${u.full_name ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const inviteM = useMutation({
    mutationFn: (data: any) => inviteFn({ data }),
    onSuccess: (res: any) => {
      const link = `${window.location.origin}/auth/signup?email=${encodeURIComponent(res.email)}`;
      setInviteLink(link);
      qc.invalidateQueries({ queryKey: ["authorised-users"] });
      qc.invalidateQueries({ queryKey: ["access-audit"] });
      toast.success("Invitation created — copy the link and share it with the user");
    },
    onError: (e: any) => toast.error(e?.message ?? "Unable to invite"),
  });

  const statusM = useMutation({
    mutationFn: (data: any) => statusFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authorised-users"] });
      qc.invalidateQueries({ queryKey: ["access-audit"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Unable to update"),
  });
  const roleM = useMutation({
    mutationFn: (data: any) => roleFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authorised-users"] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Unable to update role"),
  });
  const resendM = useMutation({
    mutationFn: (data: any) => resendFn({ data }),
    onSuccess: (res: any) => {
      const link = `${window.location.origin}/auth/signup?email=${encodeURIComponent(res.email)}`;
      navigator.clipboard.writeText(link).catch(() => {});
      qc.invalidateQueries({ queryKey: ["authorised-users"] });
      toast.success("Invitation refreshed — link copied to clipboard");
    },
    onError: (e: any) => toast.error(e?.message ?? "Unable to resend"),
  });

  if (error) {
    return (
      <div>
        <PageHeader title="Access Management" subtitle="Master Admin controls" />
        <div className="mx-auto max-w-3xl p-8">
          <Card className="p-6 text-sm">
            <div className="flex items-center gap-2 text-destructive">
              <ShieldOff className="h-4 w-4" /> Master Admin access required
            </div>
            <p className="mt-2 text-muted-foreground">Only Master Admins can view this page.</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Access Management"
        subtitle="Invite, activate, or revoke access to QualiPulse."
        actions={
          <Button size="sm" onClick={() => { setInviteOpen(true); setInviteLink(null); }}>
            <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite user
          </Button>
        }
      />

      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-16 pt-4 sm:px-8">
        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search email or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {filtered.length} of {users.length} users
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Invited</th>
                  <th className="px-4 py-3 text-left font-medium">Last login</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No users match your filters.</td></tr>
                )}
                {filtered.map((u: any) => (
                  <tr key={u.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.full_name || u.email.split("@")[0]}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Select value={u.role} onValueChange={(v) => roleM.mutate({ id: u.id, role: v })}>
                        <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["master_admin","admin","qa_evaluator","manager","viewer","agent"].map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={STATUS_TONE[u.status] || ""}>
                        {u.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.invited_at ? format(new Date(u.invited_at), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {u.status !== "active" && (
                            <DropdownMenuItem onClick={() => statusM.mutate({ id: u.id, status: "active" })}>
                              <CheckCircle2 className="mr-2 h-4 w-4" /> Activate
                            </DropdownMenuItem>
                          )}
                          {u.status !== "suspended" && (
                            <DropdownMenuItem onClick={() => statusM.mutate({ id: u.id, status: "suspended" })}>
                              <ShieldOff className="mr-2 h-4 w-4" /> Suspend
                            </DropdownMenuItem>
                          )}
                          {u.status !== "revoked" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => statusM.mutate({ id: u.id, status: "revoked" })}
                            >
                              <ShieldOff className="mr-2 h-4 w-4" /> Revoke access
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => resendM.mutate({ id: u.id })}>
                            <RefreshCw className="mr-2 h-4 w-4" /> Resend invitation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Audit log */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Recent activity</h3>
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {audit.length === 0 && <div className="text-xs text-muted-foreground">No activity yet.</div>}
            {audit.slice(0, 50).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/40 py-2 text-xs">
                <div>
                  <span className="font-medium">{a.action}</span>
                  {a.target_email && <span className="ml-2 text-muted-foreground">→ {a.target_email}</span>}
                </div>
                <span className="text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setInviteLink(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite user</DialogTitle></DialogHeader>
          {inviteLink ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Share this sign-up link with the invited user. Their email is now authorised — they can sign up any time.</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteLink} className="text-xs" />
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Copied"); }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@company.com" />
              </div>
              <div>
                <Label className="text-xs">Full name (optional)</Label>
                <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["master_admin","admin","qa_evaluator","manager","viewer","agent"].map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            {inviteLink ? (
              <Button onClick={() => setInviteOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => inviteM.mutate({ email: inviteEmail, fullName: inviteName, role: inviteRole })}
                  disabled={!inviteEmail || inviteM.isPending}
                >
                  {inviteM.isPending ? "Creating…" : "Create invitation"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
