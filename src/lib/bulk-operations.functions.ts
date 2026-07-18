import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  const isStaff = ["qa_admin", "qa_manager", "qa_reviewer"].some((r) => roles.has(r));
  if (!isStaff) throw new Error("Forbidden: staff role required");
  return roles;
}

export const bulkApproveFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdsInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context.supabase, context.userId);
    if (!roles.has("qa_admin") && !roles.has("qa_manager")) {
      throw new Error("Forbidden: only managers can approve");
    }
    const { error, count } = await context.supabase
      .from("feedback")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      }, { count: "exact" })
      .in("id", data.ids)
      .eq("status", "review");
    if (error) throw error;
    return { updated: count ?? 0 };
  });

export const bulkRejectFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdsInput.extend({ reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context.supabase, context.userId);
    if (!roles.has("qa_admin") && !roles.has("qa_manager")) {
      throw new Error("Forbidden: only managers can reject");
    }
    const { error, count } = await context.supabase
      .from("feedback")
      .update({
        status: "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_comments: data.reason ?? null,
      }, { count: "exact" })
      .in("id", data.ids)
      .eq("status", "review");
    if (error) throw error;
    return { updated: count ?? 0 };
  });

export const bulkDeleteFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdsInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context.supabase, context.userId);
    if (!roles.has("qa_admin")) throw new Error("Forbidden: admin only");
    const { error, count } = await context.supabase
      .from("feedback")
      .delete({ count: "exact" })
      .in("id", data.ids);
    if (error) throw error;
    return { deleted: count ?? 0 };
  });

const AgentRow = z.object({
  employee_id: z.string().trim().min(1).max(64),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255),
  department: z.string().trim().min(1).max(100),
  team: z.string().trim().max(100).optional().nullable(),
  manager_name: z.string().trim().max(200).optional().nullable(),
  joining_date: z.string().trim().optional().nullable(),
  qa_score: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(["active", "inactive", "on_leave"]).optional(),
});

export const importAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ rows: z.array(z.record(z.string(), z.any())).min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertStaff(context.supabase, context.userId);
    if (!roles.has("qa_admin") && !roles.has("qa_manager")) {
      throw new Error("Forbidden: manager or admin required");
    }
    const errors: Array<{ row: number; error: string }> = [];
    const valid: any[] = [];
    data.rows.forEach((raw, i) => {
      const parsed = AgentRow.safeParse(raw);
      if (!parsed.success) {
        errors.push({ row: i + 1, error: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
        return;
      }
      const v = parsed.data;
      valid.push({
        employee_id: v.employee_id,
        full_name: v.full_name,
        email: v.email.toLowerCase(),
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

    const { data: upserted, error } = await context.supabase
      .from("agents")
      .upsert(valid, { onConflict: "employee_id" })
      .select("id");
    if (error) throw error;
    return { inserted: upserted?.length ?? 0, updated: 0, errors };
  });
