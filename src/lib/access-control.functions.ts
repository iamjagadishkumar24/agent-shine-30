import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "master_admin" | "admin" | "qa_evaluator" | "manager" | "viewer" | "agent";
const ROLES: Role[] = ["master_admin", "admin", "qa_evaluator", "manager", "viewer", "agent"];
const STATUSES = ["invited", "active", "suspended", "revoked"] as const;

function fail(message: string, status = 400, err?: unknown): never {
  if (err) console.error(`[access-control] ${message}`, err);
  throw new Response(message, { status });
}

async function requireMasterAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "master_admin" });
  if (error || !data) fail("Master Admin access required", 403, error);
}

async function logAudit(
  supabase: any,
  actorUserId: string,
  action: string,
  targetEmail: string | null,
  targetUserId: string | null,
  oldValue: any,
  newValue: any,
) {
  await supabase.from("access_audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    target_email: targetEmail,
    target_user_id: targetUserId,
    old_value: oldValue,
    new_value: newValue,
  });
}

// ---------------------------------------------------------------------------
// List authorised users
// ---------------------------------------------------------------------------
export const listAuthorisedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMasterAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("authorised_users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) fail("Unable to load authorised users", 500, error);
    return data ?? [];
  });

// ---------------------------------------------------------------------------
// Invite user
// ---------------------------------------------------------------------------
const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  fullName: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  role: z.enum(ROLES as [Role, ...Role[]]),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireMasterAdmin(context.supabase, context.userId);

    // Upsert authorised_users row
    const { data: existing } = await context.supabase
      .from("authorised_users")
      .select("*")
      .ilike("email", data.email)
      .maybeSingle();

    const expiresAt = new Date(Date.now() + data.expiresInDays * 86400_000).toISOString();

    if (existing) {
      const { data: upd, error: uerr } = await context.supabase
        .from("authorised_users")
        .update({
          role: data.role,
          status: existing.status === "revoked" || existing.status === "suspended" ? "invited" : existing.status,
          full_name: data.fullName || existing.full_name,
          invited_by: context.userId,
          invited_at: new Date().toISOString(),
          invitation_expires_at: expiresAt,
          is_active: true,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (uerr) fail("Unable to update invitation", 500, uerr);
      await logAudit(context.supabase, context.userId, "invitation_updated", data.email, existing.user_id, existing, upd);
    } else {
      const { data: ins, error: ierr } = await context.supabase
        .from("authorised_users")
        .insert({
          email: data.email,
          full_name: data.fullName || null,
          role: data.role,
          status: "invited",
          invited_by: context.userId,
          invited_at: new Date().toISOString(),
          invitation_expires_at: expiresAt,
          is_active: true,
        })
        .select()
        .single();
      if (ierr) fail(ierr.message?.includes("duplicate") ? "Email already invited" : "Unable to invite user", 400, ierr);
      await logAudit(context.supabase, context.userId, "invitation_created", data.email, null, null, ins);
    }

    // Generate invitation token
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const { error: terr } = await context.supabase
      .from("user_invitations")
      .insert({
        email: data.email,
        role: data.role,
        token,
        invited_by: context.userId,
        expires_at: expiresAt,
      });
    if (terr) console.warn("[access-control] token insert failed", terr);

    return { token, email: data.email };
  });

// ---------------------------------------------------------------------------
// Update status (activate / suspend / revoke)
// ---------------------------------------------------------------------------
const StatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES),
});
export const updateAccessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireMasterAdmin(context.supabase, context.userId);

    const { data: existing } = await context.supabase
      .from("authorised_users").select("*").eq("id", data.id).maybeSingle();
    if (!existing) fail("Record not found", 404);

    // Guard: never remove last master_admin
    if (existing.role === "master_admin" && data.status !== "active") {
      const { count } = await context.supabase
        .from("authorised_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "master_admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) fail("At least one active Master Admin must exist", 400);
    }

    const { data: upd, error } = await context.supabase
      .from("authorised_users")
      .update({ status: data.status, is_active: data.status === "active" })
      .eq("id", data.id)
      .select()
      .single();
    if (error) fail("Unable to update status", 500, error);
    await logAudit(context.supabase, context.userId, `status_${data.status}`, existing.email, existing.user_id, existing, upd);
    return upd;
  });

// ---------------------------------------------------------------------------
// Change role
// ---------------------------------------------------------------------------
const RoleSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(ROLES as [Role, ...Role[]]),
});
export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RoleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireMasterAdmin(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("authorised_users").select("*").eq("id", data.id).maybeSingle();
    if (!existing) fail("Record not found", 404);

    // Guard last master admin
    if (existing.role === "master_admin" && data.role !== "master_admin") {
      const { count } = await context.supabase
        .from("authorised_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "master_admin")
        .eq("status", "active");
      if ((count ?? 0) <= 1) fail("At least one active Master Admin must exist", 400);
    }

    const { data: upd, error } = await context.supabase
      .from("authorised_users").update({ role: data.role }).eq("id", data.id).select().single();
    if (error) fail("Unable to change role", 500, error);

    // Also sync user_roles if linked user
    if (existing.user_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("user_roles").delete().eq("user_id", existing.user_id);
      await supabaseAdmin.from("user_roles").insert({ user_id: existing.user_id, role: data.role });
    }

    await logAudit(context.supabase, context.userId, "role_changed", existing.email, existing.user_id,
      { role: existing.role }, { role: data.role });
    return upd;
  });

// ---------------------------------------------------------------------------
// Resend invitation (regenerate token + reset expiry)
// ---------------------------------------------------------------------------
export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMasterAdmin(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("authorised_users").select("*").eq("id", data.id).maybeSingle();
    if (!existing) fail("Record not found", 404);

    const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
    await context.supabase
      .from("authorised_users")
      .update({ invited_at: new Date().toISOString(), invitation_expires_at: expiresAt, status: "invited", is_active: true })
      .eq("id", data.id);

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await context.supabase.from("user_invitations").insert({
      email: existing.email, role: existing.role, token, invited_by: context.userId, expires_at: expiresAt,
    });
    await logAudit(context.supabase, context.userId, "invitation_resent", existing.email, existing.user_id, null, { token });
    return { token, email: existing.email };
  });

// ---------------------------------------------------------------------------
// List audit log
// ---------------------------------------------------------------------------
export const listAccessAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireMasterAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("access_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) fail("Unable to load audit logs", 500, error);
    return data ?? [];
  });
