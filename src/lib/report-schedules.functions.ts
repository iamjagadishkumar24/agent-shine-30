import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function fail(status: number, message: string, logCtx?: unknown): never {
  if (logCtx !== undefined) console.error("[report-schedules.functions]", message, logCtx);
  throw new Response(message, { status });
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "qa_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!isAdmin && !isSuper) fail(403, "Admin role required");
}

const ScheduleInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    report_type: z.enum(["agent_performance", "feedback_trends", "email_delivery"]),
    format: z.enum(["pdf", "csv", "both"]),
    cadence: z.enum(["weekly", "monthly"]),
    day_of_week: z.number().int().min(0).max(6).nullable().optional(),
    day_of_month: z.number().int().min(1).max(28).nullable().optional(),
    hour_utc: z.number().int().min(0).max(23).default(13),
    recipients: z
      .array(z.string().trim().toLowerCase().email().max(254))
      .min(1)
      .max(50)
      .transform((r) => Array.from(new Set(r))),
    enabled: z.boolean().default(true),
  })
  .refine(
    (v) => v.cadence !== "weekly" || (v.day_of_week ?? null) !== null,
    { message: "day_of_week required for weekly cadence", path: ["day_of_week"] },
  )
  .refine(
    (v) => v.cadence !== "monthly" || (v.day_of_month ?? null) !== null,
    { message: "day_of_month required for monthly cadence", path: ["day_of_month"] },
  );

// Compute the next UTC run for a given cadence.
export function computeNextRunAt(input: {
  cadence: "weekly" | "monthly";
  day_of_week?: number | null;
  day_of_month?: number | null;
  hour_utc: number;
  from?: Date;
}): Date {
  const from = input.from ?? new Date();
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), input.hour_utc, 0, 0, 0));
  if (input.cadence === "weekly") {
    const target = input.day_of_week ?? 1;
    let diff = (target - d.getUTCDay() + 7) % 7;
    if (diff === 0 && d.getTime() <= from.getTime()) diff = 7;
    d.setUTCDate(d.getUTCDate() + diff);
    return d;
  }
  // monthly
  const target = input.day_of_month ?? 1;
  const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), target, input.hour_utc, 0, 0, 0));
  if (candidate.getTime() <= from.getTime()) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    candidate.setUTCDate(target);
  }
  return candidate;
}

export const listReportSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("report_schedules")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) fail(500, "Failed to load schedules", error);
    return data ?? [];
  });

export const upsertReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const parsed = ScheduleInput.safeParse(data);
    if (!parsed.success) throw new Response("Invalid schedule payload", { status: 400 });
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const next_run_at = computeNextRunAt({
      cadence: data.cadence,
      day_of_week: data.day_of_week ?? null,
      day_of_month: data.day_of_month ?? null,
      hour_utc: data.hour_utc,
    }).toISOString();

    const payload = {
      name: data.name,
      report_type: data.report_type,
      format: data.format,
      cadence: data.cadence,
      day_of_week: data.cadence === "weekly" ? data.day_of_week ?? 1 : null,
      day_of_month: data.cadence === "monthly" ? data.day_of_month ?? 1 : null,
      hour_utc: data.hour_utc,
      recipients: data.recipients,
      enabled: data.enabled,
      next_run_at,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("report_schedules").update(payload).eq("id", data.id).select().single();
      if (error) fail(500, "Failed to update schedule", error);
      if (!row) fail(404, "Schedule not found");
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("report_schedules").insert(payload).select().single();
    if (error) fail(500, "Failed to create schedule", error);
    return row;
  });

export const deleteReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(data);
    if (!parsed.success) throw new Response("Invalid schedule id", { status: 400 });
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error, count } = await context.supabase
      .from("report_schedules")
      .delete({ count: "exact" })
      .eq("id", data.id);
    if (error) fail(500, "Failed to delete schedule", error);
    if (!count) fail(404, "Schedule not found");
    return { ok: true };
  });

export const runReportScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(data);
    if (!parsed.success) throw new Response("Invalid schedule id", { status: 400 });
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Verify schedule exists and caller can see it under RLS before dispatching
    // via the admin-privileged helper.
    const { data: row, error } = await context.supabase
      .from("report_schedules").select("id").eq("id", data.id).maybeSingle();
    if (error) fail(500, "Failed to load schedule", error);
    if (!row) fail(404, "Schedule not found");

    try {
      const { dispatchSchedule } = await import("@/lib/report-schedules.server");
      return await dispatchSchedule(data.id);
    } catch (e) {
      fail(500, "Failed to dispatch schedule", e);
    }
  });
