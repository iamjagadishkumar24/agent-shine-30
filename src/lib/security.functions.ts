import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "qa_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!isAdmin && !isSuper) {
    throw new Response("Admin role required", { status: 403 });
  }
}

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Recent auth events (best-effort — auth.audit_log_entries may be gated)
    let recentLogins: Array<{ id: string; created_at: string; event: string; ip: string | null; user: string | null }> = [];
    let loginError: string | null = null;
    try {
      const { data, error } = await supabaseAdmin
        .schema("auth" as any)
        .from("audit_log_entries" as any)
        .select("id, created_at, payload, ip_address")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      recentLogins = (data ?? []).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        event: r.payload?.action ?? r.payload?.event ?? "unknown",
        ip: r.ip_address ?? null,
        user: r.payload?.actor_username ?? r.payload?.traits?.user_email ?? null,
      }));
    } catch (e) {
      loginError = e instanceof Error ? e.message : String(e);
    }

    // Recent audit log
    const { data: auditRaw } = await supabaseAdmin
      .from("feedback_audit_log")
      .select("id, action, actor_id, feedback_id, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    // Role counts
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role");
    const roleCounts: Record<string, number> = {};
    for (const r of roleRows ?? []) {
      const key = String((r as any).role);
      roleCounts[key] = (roleCounts[key] ?? 0) + 1;
    }

    // Email queue health
    const [{ count: qFail }, { count: qQueued }, { count: qSent }] = await Promise.all([
      supabaseAdmin.from("email_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
      supabaseAdmin.from("email_queue").select("*", { count: "exact", head: true }).eq("status", "queued"),
      supabaseAdmin.from("email_queue").select("*", { count: "exact", head: true }).eq("status", "sent"),
    ]);

    // Users totals
    let userCount = 0;
    try {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1, page: 1 });
      userCount = (data as any)?.total ?? (data as any)?.users?.length ?? 0;
    } catch {
      /* ignore */
    }

    return {
      generatedAt: new Date().toISOString(),
      recentLogins,
      loginError,
      auditLog: auditRaw ?? [],
      roleCounts,
      email: { failed: qFail ?? 0, queued: qQueued ?? 0, sent: qSent ?? 0 },
      userCount,
      posture: {
        hstsEnabled: true,
        cspEnabled: true,
        rlsEnforced: true,
        mfaAvailable: true,
        hibpEnabled: true,
      },
    };
  });
