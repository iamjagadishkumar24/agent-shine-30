// Server-only dispatcher for scheduled reports. Generates PDF/CSV,
// uploads to storage, enqueues an email with attachments.

import { buildReportRows, rowsToCsv, rowsToPdf, REPORT_TYPE_LABEL, type ReportType } from "@/lib/reports.server";
import { computeNextRunAt } from "@/lib/report-schedules.functions";

const BUCKET = "feedback-attachments"; // reused private bucket

type ScheduleRow = {
  id: string;
  name: string;
  report_type: ReportType;
  format: "pdf" | "csv" | "both";
  cadence: "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  hour_utc: number;
  recipients: string[];
  enabled: boolean;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function emailBody(schedule: ScheduleRow, subtitle: string, senderName: string): { html: string; text: string } {
  const label = REPORT_TYPE_LABEL[schedule.report_type];
  const cadence = schedule.cadence === "weekly" ? "weekly" : "monthly";
  const now = new Date().toUTCString();
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b12;color:#e6e6ef;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:32px 24px">
      <div style="background:linear-gradient(135deg,#1a1330,#0b0b12);border:1px solid #2a2340;border-radius:12px;padding:28px">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a996ff;font-weight:600">Signal QMS · Scheduled Report</div>
        <h1 style="margin:8px 0 4px;font-size:22px">${escapeHtml(schedule.name)}</h1>
        <div style="color:#9a94b5;font-size:14px">${escapeHtml(label)} · ${escapeHtml(subtitle)}</div>
        <hr style="border:none;border-top:1px solid #2a2340;margin:20px 0" />
        <p style="margin:0 0 12px;color:#c9c4de;font-size:14px;line-height:1.55">
          Your ${cadence} <b>${escapeHtml(label)}</b> report is attached. This was generated automatically on ${now}.
        </p>
        <p style="margin:0;color:#7a748f;font-size:12px">Sent by ${escapeHtml(senderName)} · Signal QMS automation</p>
      </div>
    </div></body></html>`;
  const text = `${schedule.name}\n${label} · ${subtitle}\n\nYour ${cadence} ${label} report is attached. Generated ${now}.`;
  return { html, text };
}

export async function dispatchSchedule(scheduleId: string): Promise<{ ok: boolean; enqueued: number; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: schedule, error: sErr } = await supabaseAdmin
    .from("report_schedules").select("*").eq("id", scheduleId).maybeSingle();
  if (sErr || !schedule) return { ok: false, enqueued: 0, error: sErr?.message ?? "not found" };

  const s = schedule as ScheduleRow;
  if (!s.enabled) return { ok: false, enqueued: 0, error: "disabled" };
  if (!s.recipients?.length) {
    await supabaseAdmin.from("report_schedules").update({ last_run_at: new Date().toISOString(), last_status: "skipped", last_error: "no recipients" }).eq("id", s.id);
    return { ok: false, enqueued: 0, error: "no recipients" };
  }

  const { data: settings } = await supabaseAdmin.from("email_settings").select("*").eq("singleton", true).maybeSingle();
  if (!settings || settings.enabled === false) {
    await supabaseAdmin.from("report_schedules").update({ last_run_at: new Date().toISOString(), last_status: "skipped", last_error: "email service disabled" }).eq("id", s.id);
    return { ok: false, enqueued: 0, error: "email disabled" };
  }

  try {
    const { title, subtitle, rows } = await buildReportRows(supabaseAdmin, s.report_type);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseKey = `reports/${s.id}/${stamp}`;

    const uploads: { storage_path: string; file_name: string; mime_type: string }[] = [];

    if (s.format === "pdf" || s.format === "both") {
      const bytes = rowsToPdf({ title, subtitle, rows });
      const path = `${baseKey}.pdf`;
      const { error } = await supabaseAdmin.storage.from(BUCKET)
        .upload(path, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
      if (error) throw new Error(`upload pdf: ${error.message}`);
      uploads.push({ storage_path: path, file_name: `${s.report_type}-${stamp}.pdf`, mime_type: "application/pdf" });
    }
    if (s.format === "csv" || s.format === "both") {
      const csv = rowsToCsv(rows);
      const path = `${baseKey}.csv`;
      const { error } = await supabaseAdmin.storage.from(BUCKET)
        .upload(path, new Blob([csv], { type: "text/csv" }), { contentType: "text/csv", upsert: true });
      if (error) throw new Error(`upload csv: ${error.message}`);
      uploads.push({ storage_path: path, file_name: `${s.report_type}-${stamp}.csv`, mime_type: "text/csv" });
    }

    const { html, text } = emailBody(s, subtitle, settings.sender_name ?? "Signal QMS");
    const subject = `[${s.cadence === "weekly" ? "Weekly" : "Monthly"}] ${REPORT_TYPE_LABEL[s.report_type]} — ${s.name}`;

    const jobs = s.recipients.map((to) => ({
      to_email: to,
      subject,
      html,
      text_body: text,
      kind: "report",
      attachments: uploads,
      priority: 5,
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      max_attempts: 5,
    }));
    const { error: qErr } = await supabaseAdmin.from("email_queue").insert(jobs);
    if (qErr) throw new Error(`enqueue: ${qErr.message}`);

    const nextRun = computeNextRunAt({
      cadence: s.cadence,
      day_of_week: s.day_of_week,
      day_of_month: s.day_of_month,
      hour_utc: s.hour_utc,
    }).toISOString();

    await supabaseAdmin.from("report_schedules").update({
      last_run_at: new Date().toISOString(),
      last_status: "queued",
      last_error: null,
      next_run_at: nextRun,
    }).eq("id", s.id);

    return { ok: true, enqueued: jobs.length };
  } catch (e: any) {
    await supabaseAdmin.from("report_schedules").update({
      last_run_at: new Date().toISOString(),
      last_status: "failed",
      last_error: e?.message ?? String(e),
    }).eq("id", s.id);
    return { ok: false, enqueued: 0, error: e?.message ?? String(e) };
  }
}

export async function dispatchDueSchedules(): Promise<{ dispatched: number; results: any[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("report_schedules")
    .select("id")
    .eq("enabled", true)
    .lte("next_run_at", nowIso)
    .limit(50);

  const results: any[] = [];
  for (const row of (due ?? []) as { id: string }[]) {
    results.push({ id: row.id, ...(await dispatchSchedule(row.id)) });
  }
  return { dispatched: results.length, results };
}
