import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "qa_admin" });
  if (data) return;
  const { data: sa } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (!sa) throw new Error("Forbidden: admin required");
}

const ScheduleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  report_type: z.enum(["agent_performance", "feedback_trends", "email_delivery"]),
  format: z.enum(["pdf", "csv", "both"]),
  cadence: z.enum(["weekly", "monthly"]),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  day_of_month: z.number().int().min(1).max(28).nullable().optional(),
  hour_utc: z.number().int().min(0).max(23).default(13),
  recipients: z.array(z.string().email()).min(1).max(50),
  enabled: z.boolean().default(true),
});

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
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ScheduleInput.parse(data))
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
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("report_schedules").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteReportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("report_schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runReportScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { dispatchSchedule } = await import("@/lib/report-schedules.server");
    return dispatchSchedule(data.id);
  });
