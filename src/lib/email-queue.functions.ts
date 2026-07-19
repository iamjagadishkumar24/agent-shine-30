import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function fail(message: string, status: number, err?: unknown): never {
  if (err) console.error(`[email-queue] ${message}`, err);
  throw new Response(message, { status });
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [qa, sa] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "qa_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (qa.error && sa.error) fail("Unable to verify permissions", 500, qa.error);
  if (!qa.data && !sa.data) fail("Forbidden: admin required", 403);
}

const ALLOWED_STATUS = ["queued", "sending", "sent", "failed", "paused", "cancelled"] as const;

export const listEmailQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(ALLOWED_STATUS).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      })
      .default({})
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("email_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) fail("Unable to load email queue", 500, error);
    return rows ?? [];
  });

export const emailQueueSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from("email_queue").select("status");
    if (error) fail("Unable to load queue summary", 500, error);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  });

export const retryEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("email_queue")
      .update({
        status: "queued",
        next_attempt_at: new Date().toISOString(),
        attempts: 0,
        last_error: null,
      })
      .eq("id", data.id)
      .in("status", ["failed", "paused", "cancelled"])
      .select("id");
    if (error) fail("Unable to retry email", 500, error);
    if (!rows || rows.length === 0) fail("Email not found or not retryable", 409);
    return { ok: true };
  });

export const retryAllFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("email_queue")
      .update({
        status: "queued",
        next_attempt_at: new Date().toISOString(),
        attempts: 0,
        last_error: null,
      })
      .eq("status", "failed")
      .select("id");
    if (error) fail("Unable to retry failed emails", 500, error);
    return { ok: true, count: (data ?? []).length };
  });

export const cancelEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("email_queue")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .in("status", ["queued", "failed", "paused"])
      .select("id");
    if (error) fail("Unable to cancel email", 500, error);
    if (!rows || rows.length === 0) fail("Email not found or not cancellable", 409);
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
    if (error) fail("Unable to pause queue", 500, error);
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
    if (error) fail("Unable to resume queue", 500, error);
    return { ok: true, resumed: (data ?? []).length };
  });

export const drainNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    try {
      const { drainQueue } = await import("@/lib/email-queue.server");
      return await drainQueue();
    } catch (err) {
      fail("Unable to drain queue", 500, err);
    }
  });
