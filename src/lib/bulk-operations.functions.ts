import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdsInput = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1)
    .max(500)
    .transform((ids) => Array.from(new Set(ids))),
});

const STAFF_ROLES = ["qa_admin", "qa_manager", "qa_reviewer"] as const;

async function loadRoles(supabase: any, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) {
    console.error("[bulk-operations] role lookup failed", error);
    throw new Response("Unable to verify permissions", { status: 500 });
  }
  return new Set((data ?? []).map((r: any) => r.role));
}

function requireAny(roles: Set<string>, allowed: readonly string[], message: string) {
  if (!allowed.some((r) => roles.has(r))) {
    throw new Response(message, { status: 403 });
  }
}

export const bulkApproveFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdsInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await loadRoles(context.supabase, context.userId);
    requireAny(roles, STAFF_ROLES, "Staff role required");
    requireAny(roles, ["qa_admin", "qa_manager"], "Only managers can approve");
    const { error, count } = await context.supabase
      .from("feedback")
      .update(
        {
          status: "approved",
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        } as any,
        { count: "exact" },
      )
      .in("id", data.ids)
      .eq("status", "review");
    if (error) {
      console.error("[bulk-operations] approve failed", error);
      throw new Response("Bulk approve failed", { status: 500 });
    }
    return { updated: count ?? 0 };
  });

export const bulkRejectFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    IdsInput.extend({
      reason: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await loadRoles(context.supabase, context.userId);
    requireAny(roles, STAFF_ROLES, "Staff role required");
    requireAny(roles, ["qa_admin", "qa_manager"], "Only managers can reject");
    const reason = data.reason && data.reason.length > 0 ? data.reason : null;
    const { error, count } = await context.supabase
      .from("feedback")
      .update(
        {
          status: "rejected",
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          review_comments: reason,
        } as any,
        { count: "exact" },
      )
      .in("id", data.ids)
      .eq("status", "review");
    if (error) {
      console.error("[bulk-operations] reject failed", error);
      throw new Response("Bulk reject failed", { status: 500 });
    }
    return { updated: count ?? 0 };
  });

export const bulkDeleteFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdsInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await loadRoles(context.supabase, context.userId);
    requireAny(roles, ["qa_admin"], "Admin role required");
    const { error, count } = await context.supabase
      .from("feedback")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) {
      console.error("[bulk-operations] delete failed", error);
      throw new Response("Bulk delete failed", { status: 500 });
    }
    return { deleted: count ?? 0 };
  });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const AgentRow = z.object({
  employee_id: z.string().trim().min(1).max(64),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  department: z.string().trim().min(1).max(100),
  team: z.string().trim().max(100).optional().nullable(),
  manager_name: z.string().trim().max(200).optional().nullable(),
  joining_date: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || ISO_DATE.test(v), { message: "joining_date must be YYYY-MM-DD" }),
  qa_score: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(["active", "inactive", "on_leave"]).optional(),
});

export const importAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(z.record(z.string(), z.any())).min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await loadRoles(context.supabase, context.userId);
    requireAny(roles, ["qa_admin", "qa_manager"], "Manager or admin required");

    const errors: Array<{ row: number; error: string }> = [];
    const seenEmployeeIds = new Set<string>();
    const seenEmails = new Set<string>();
    const valid: any[] = [];

    data.rows.forEach((raw, i) => {
      const parsed = AgentRow.safeParse(raw);
      if (!parsed.success) {
        errors.push({
          row: i + 1,
          error: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "),
        });
        return;
      }
      const v = parsed.data;
      const emailLower = v.email.toLowerCase();
      if (seenEmployeeIds.has(v.employee_id)) {
        errors.push({ row: i + 1, error: `Duplicate employee_id in import: ${v.employee_id}` });
        return;
      }
      if (seenEmails.has(emailLower)) {
        errors.push({ row: i + 1, error: `Duplicate email in import: ${emailLower}` });
        return;
      }
      seenEmployeeIds.add(v.employee_id);
      seenEmails.add(emailLower);
      valid.push({
        employee_id: v.employee_id,
        full_name: v.full_name,
        email: emailLower,
        department: v.department,
        team: v.team || null,
        manager_name: v.manager_name || null,
        joining_date: v.joining_date || null,
        qa_score: v.qa_score ?? 0,
        status: v.status ?? "active",
        created_by: context.userId,
      });
    });

    if (valid.length === 0) return { inserted: 0, updated: 0, errors };

    // Chunk large upserts to avoid single oversized statements.
    const CHUNK = 200;
    let inserted = 0;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK);
      const { data: upserted, error } = await context.supabase
        .from("agents")
        .upsert(chunk, { onConflict: "employee_id" })
        .select("id");
      if (error) {
        console.error("[bulk-operations] agent upsert failed", error);
        throw new Response("Agent import failed", { status: 500 });
      }
      inserted += upserted?.length ?? 0;
    }
    return { inserted, updated: 0, errors };
  });
