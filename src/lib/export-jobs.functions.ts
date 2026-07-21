import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function fail(message: string, status = 400, err?: unknown): never {
  if (err) console.error(`[export-jobs] ${message}`, err);
  throw new Response(message, { status });
}

const KIND = z.enum(["agent_feedback", "agent_emails"]);

const EnqueueSchema = z.object({
  kind: KIND,
  label: z.string().max(200).optional(),
  params: z.record(z.string(), z.any()).default({}),
});

export const enqueueExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EnqueueSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    await enforceRateLimit({ bucket: "export.enqueue", key: userId });
    const { data: row, error } = await supabase

      .from("export_jobs")
      .insert({
        user_id: userId,
        kind: data.kind,
        format: "csv",
        label: data.label ?? null,
        params: data.params,
        status: "queued",
      })
      .select("id")
      .single();
    if (error) fail("Unable to queue export", 500, error);

    // Kick off processing without blocking the response. Errors are logged
    // server-side; the row remains queued and pg_cron will retry it.
    try {
      const url = process.env.SITE_URL || process.env.APP_URL || null;
      const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (url && key) {
        void fetch(`${url}/api/public/hooks/process-exports`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ jobId: row!.id }),
        }).catch((e) => console.warn("[export-jobs] kick failed", e));
      }
    } catch (e) {
      console.warn("[export-jobs] kick error", e);
    }

    return { id: row!.id };
  });

export const listMyExports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("export_jobs")
      .select("id, kind, label, status, progress, total, row_count, file_name, error, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) fail("Unable to list exports", 500, error);
    return data ?? [];
  });

export const cancelExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("export_jobs")
      .update({ status: "canceled", completed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (error) fail("Unable to cancel export", 500, error);
    return { canceled: !!row };
  });

export const getExportDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("export_jobs")
      .select("id, user_id, file_path, file_name, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !job) fail("Export not found", 404, error);
    if (job.status !== "completed" || !job.file_path) fail("Export not ready", 409);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: serr } = await supabaseAdmin.storage
      .from("exports")
      .createSignedUrl(job.file_path, 60 * 15, { download: job.file_name ?? undefined });
    if (serr || !signed) fail("Unable to create download link", 500, serr);
    return { url: signed.signedUrl, fileName: job.file_name };
  });
