import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "qa_admin" });
  if (data) return;
  const { data: sa } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (!sa) throw new Error("Forbidden: admin required");
}

export const listEmailQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string; limit?: number } | undefined) =>
    z
      .object({ status: z.string().optional(), limit: z.number().min(1).max(200).optional() })
      .default({})
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase.from("email_queue").select("*").order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const emailQueueSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from("email_queue").select("status");
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  });

export const retryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("email_queue")
      .update({ status: "queued", next_attempt_at: new Date().toISOString(), attempts: 0, last_error: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retryAllFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_queue")
      .update({ status: "queued", next_attempt_at: new Date().toISOString(), attempts: 0, last_error: null })
      .eq("status", "failed")
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, count: (data ?? []).length };
  });

export const cancelEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("email_queue")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .in("status", ["queued", "failed", "paused"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pauseQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_queue")
      .update({ status: "paused" })
      .in("status", ["queued", "failed"])
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, paused: (data ?? []).length };
  });

export const resumeQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_queue")
      .update({ status: "queued", next_attempt_at: new Date().toISOString() })
      .eq("status", "paused")
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, resumed: (data ?? []).length };
  });

export const drainNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { drainQueue } = await import("@/lib/email-queue.server");
    return drainQueue();
  });
