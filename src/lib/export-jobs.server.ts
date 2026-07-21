// Background export worker. Runs inside a server route handler; imported
// dynamically so this module never ships to the client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { format as fmt } from "date-fns";
import { csvEscape, csvRow } from "@/lib/csv-safe";

const BATCH = 500;
const MAX_ROWS = 50_000;

// csvEscape/csvRow imported from @/lib/csv-safe — formula-injection safe.
void csvEscape;


function fmtDt(v: string | null | undefined): string {
  if (!v) return "";
  try {
    return fmt(new Date(v), "yyyy-MM-dd HH:mm");
  } catch {
    return "";
  }
}

type Params = Record<string, any>;

async function updateJob(id: string, patch: Record<string, any>) {
  await supabaseAdmin.from("export_jobs").update(patch as any).eq("id", id);
}

async function countAgentFeedback(params: Params): Promise<number> {
  let q = supabaseAdmin
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", params.agentId);
  if (params.from) q = q.gte("created_at", params.from);
  if (params.to) q = q.lte("created_at", params.to);
  if (params.status) q = q.eq("status", params.status);
  if (params.ackStatus) q = q.eq("acknowledgement_status", params.ackStatus);
  if (params.interactionType) q = q.eq("interaction_type", params.interactionType);
  if (typeof params.minScore === "number") q = q.gte("score", params.minScore);
  if (typeof params.maxScore === "number") q = q.lte("score", params.maxScore);
  if (params.search) {
    const s = String(params.search).replace(/[%,]/g, " ");
    q = q.or(`title.ilike.%${s}%,case_number.ilike.%${s}%,category.ilike.%${s}%`);
  }
  const { count } = await q;
  return count ?? 0;
}

async function* iterAgentFeedback(params: Params) {
  const pageSize = BATCH;
  const sortBy = params.sortBy || "created_at";
  const asc = params.sortDir === "asc";
  let offset = 0;
  while (offset < MAX_ROWS) {
    let q = supabaseAdmin
      .from("feedback")
      .select(
        "case_number, title, interaction_type, score, overall_percentage, status, acknowledgement_status, category, sent_at, delivered_at, opened_at, acknowledged_at, created_at",
      )
      .eq("agent_id", params.agentId);
    if (params.from) q = q.gte("created_at", params.from);
    if (params.to) q = q.lte("created_at", params.to);
    if (params.status) q = q.eq("status", params.status);
    if (params.ackStatus) q = q.eq("acknowledgement_status", params.ackStatus);
    if (params.interactionType) q = q.eq("interaction_type", params.interactionType);
    if (typeof params.minScore === "number") q = q.gte("score", params.minScore);
    if (typeof params.maxScore === "number") q = q.lte("score", params.maxScore);
    if (params.search) {
      const s = String(params.search).replace(/[%,]/g, " ");
      q = q.or(`title.ilike.%${s}%,case_number.ilike.%${s}%,category.ilike.%${s}%`);
    }
    q = q.order(sortBy, { ascending: asc, nullsFirst: false }).range(offset, offset + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;
    yield rows as any[];
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
}

async function countAgentEmails(params: Params): Promise<{ ids: string[]; count: number }> {
  let fq = supabaseAdmin.from("feedback").select("id").eq("agent_id", params.agentId);
  if (params.from) fq = fq.gte("created_at", params.from);
  if (params.to) fq = fq.lte("created_at", params.to);
  const { data } = await fq;
  const ids = (data ?? []).map((r: any) => r.id);
  if (!ids.length) return { ids, count: 0 };

  let q = supabaseAdmin.from("email_queue").select("id", { count: "exact", head: true }).in("feedback_id", ids);
  if (params.status) q = q.eq("status", params.status);
  if (params.search) {
    const s = String(params.search).replace(/[%,]/g, " ");
    q = q.or(`subject.ilike.%${s}%,to_email.ilike.%${s}%,provider_message_id.ilike.%${s}%`);
  }
  const { count } = await q;
  return { ids, count: count ?? 0 };
}

async function* iterAgentEmails(params: Params, ids: string[]) {
  if (!ids.length) return;
  const pageSize = BATCH;
  const sortBy = params.sortBy || "created_at";
  const asc = params.sortDir === "asc";
  let offset = 0;
  while (offset < MAX_ROWS) {
    let q = supabaseAdmin
      .from("email_queue")
      .select(
        "subject, to_email, status, provider, provider_message_id, provider_status, attempts, max_attempts, last_error, sent_at, delivered_at, bounced_at, bounce_reason, created_at",
      )
      .in("feedback_id", ids);
    if (params.status) q = q.eq("status", params.status);
    if (params.search) {
      const s = String(params.search).replace(/[%,]/g, " ");
      q = q.or(`subject.ilike.%${s}%,to_email.ilike.%${s}%,provider_message_id.ilike.%${s}%`);
    }
    q = q.order(sortBy, { ascending: asc, nullsFirst: false }).range(offset, offset + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;
    yield rows as any[];
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
}

async function runFeedbackJob(jobId: string, params: Params, label: string) {
  const total = await countAgentFeedback(params);
  await updateJob(jobId, { total, progress: 0 });

  const header = [
    "Case", "Title", "Type", "Score", "Overall %", "Status", "Acknowledgement",
    "Category", "Sent", "Delivered", "Opened", "Acknowledged", "Created",
  ];
  let csv = csvRow(header);
  let done = 0;
  let lastPct = -1;

  for await (const batch of iterAgentFeedback(params)) {
    for (const f of batch) {
      csv += csvRow([
        f.case_number, f.title, f.interaction_type, f.score, f.overall_percentage,
        f.status, f.acknowledgement_status, f.category,
        fmtDt(f.sent_at), fmtDt(f.delivered_at), fmtDt(f.opened_at),
        fmtDt(f.acknowledged_at), fmtDt(f.created_at),
      ]);
    }
    done += batch.length;
    const pct = total ? Math.min(99, Math.floor((done / total) * 100)) : 0;
    if (pct !== lastPct) {
      lastPct = pct;
      await updateJob(jobId, { progress: pct, row_count: done });
    }
  }
  return { csv, rowCount: done, label };
}

async function runEmailJob(jobId: string, params: Params, label: string) {
  const { ids, count } = await countAgentEmails(params);
  await updateJob(jobId, { total: count, progress: 0 });

  const header = [
    "Subject", "Recipient", "Status", "Provider", "Provider Message ID",
    "Provider Status", "Attempts", "Last Error", "Sent", "Delivered",
    "Bounced", "Bounce Reason", "Created",
  ];
  let csv = csvRow(header);
  let done = 0;
  let lastPct = -1;

  for await (const batch of iterAgentEmails(params, ids)) {
    for (const e of batch) {
      csv += csvRow([
        e.subject, e.to_email, e.status, e.provider, e.provider_message_id,
        e.provider_status, `${e.attempts}/${e.max_attempts}`, e.last_error,
        fmtDt(e.sent_at), fmtDt(e.delivered_at), fmtDt(e.bounced_at),
        e.bounce_reason, fmtDt(e.created_at),
      ]);
    }
    done += batch.length;
    const pct = count ? Math.min(99, Math.floor((done / count) * 100)) : 0;
    if (pct !== lastPct) {
      lastPct = pct;
      await updateJob(jobId, { progress: pct, row_count: done });
    }
  }
  return { csv, rowCount: done, label };
}

export async function processExportJob(jobId: string): Promise<{ processed: boolean; reason?: string }> {
  // Atomically claim: only proceed if still queued.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("export_jobs")
    .update({ status: "processing", started_at: new Date().toISOString(), progress: 0 })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, user_id, kind, params, label")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return { processed: false, reason: "not_queued" };

  const params = (claimed.params ?? {}) as Params;
  const baseLabel =
    claimed.label ??
    (claimed.kind === "agent_feedback" ? "Agent feedback export" : "Agent email history export");

  try {
    const { csv, rowCount } =
      claimed.kind === "agent_feedback"
        ? await runFeedbackJob(jobId, params, baseLabel)
        : await runEmailJob(jobId, params, baseLabel);

    const safe = (params.agentSlug || "agent").toString().replace(/[^a-z0-9-]+/gi, "-").slice(0, 60);
    const fileName = `${claimed.kind}-${safe}-${fmt(new Date(), "yyyyMMdd-HHmm")}.csv`;
    const filePath = `${claimed.user_id}/${jobId}.csv`;

    const bytes = new TextEncoder().encode(csv);
    const { error: upErr } = await supabaseAdmin.storage
      .from("exports")
      .upload(filePath, bytes, { contentType: "text/csv; charset=utf-8", upsert: true });
    if (upErr) throw upErr;

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      row_count: rowCount,
      file_path: filePath,
      file_name: fileName,
      completed_at: new Date().toISOString(),
    });
    return { processed: true };
  } catch (e: any) {
    console.error("[export-jobs] processing failed", jobId, e);
    await updateJob(jobId, {
      status: "failed",
      error: String(e?.message ?? e).slice(0, 500),
      completed_at: new Date().toISOString(),
    });
    return { processed: true, reason: "failed" };
  }
}

export async function drainQueuedExports(maxJobs = 3): Promise<{ processed: number }> {
  const { data: pending } = await supabaseAdmin
    .from("export_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(maxJobs);
  let processed = 0;
  for (const j of pending ?? []) {
    const res = await processExportJob(j.id);
    if (res.processed) processed += 1;
  }
  return { processed };
}
