// Server-only queue drainer. Import only from server-fn handlers or
// server route handlers. Uses service-role client (bypasses RLS).

import { getProvider } from "./email/providers.server";

const BATCH = 10;

function backoffSeconds(attempt: number): number {
  // 1m, 5m, 20m, 1h, 4h caps at 6h
  const table = [60, 300, 1200, 3600, 14400, 21600];
  return table[Math.min(attempt, table.length - 1)];
}

type Attachment = {
  storage_path: string;
  file_name: string;
  mime_type?: string | null;
};

async function loadAttachmentBytes(
  supabaseAdmin: any,
  atts: Attachment[],
): Promise<{ ok: true; attachments: Array<{ filename: string; mimeType: string; contentBase64: string }> } | { ok: false; error: string }> {
  const out: Array<{ filename: string; mimeType: string; contentBase64: string }> = [];
  let total = 0;
  const MAX_TOTAL = 12 * 1024 * 1024; // 12 MB safety cap
  for (const a of atts) {
    const { data, error } = await supabaseAdmin.storage.from("feedback-attachments").download(a.storage_path);
    if (error) return { ok: false, error: `attachment ${a.file_name}: ${error.message}` };
    const buf = Buffer.from(await data.arrayBuffer());
    total += buf.length;
    if (total > MAX_TOTAL) return { ok: false, error: `attachments exceed ${MAX_TOTAL} bytes` };
    out.push({
      filename: a.file_name,
      mimeType: a.mime_type || "application/octet-stream",
      contentBase64: buf.toString("base64"),
    });
  }
  return { ok: true, attachments: out };
}

export async function drainQueue(): Promise<{ processed: number; results: any[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Load settings singleton
  const { data: settings } = await supabaseAdmin
    .from("email_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  if (!settings || settings.enabled === false) {
    return { processed: 0, results: [{ skipped: "email service disabled" }] };
  }

  // Claim a batch by moving 'queued'+due rows to 'sending'
  const nowIso = new Date().toISOString();
  const { data: claimable } = await supabaseAdmin
    .from("email_queue")
    .select("id")
    .in("status", ["queued", "failed"])
    .lte("next_attempt_at", nowIso)
    .order("priority", { ascending: true })
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH);

  const ids = (claimable ?? []).map((r: any) => r.id);
  if (!ids.length) return { processed: 0, results: [] };

  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("email_queue")
    .update({ status: "sending" })
    .in("id", ids)
    .in("status", ["queued", "failed"])
    .select("*");

  if (claimErr) return { processed: 0, results: [{ error: claimErr.message }] };

  const provider = getProvider(settings.provider);
  const results: any[] = [];

  const overrideEnabled = !!settings.dev_override_enabled;
  const overrideRecipient = (settings.dev_override_recipient ?? "").trim();
  const applyOverride = overrideEnabled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideRecipient);

  for (const job of claimed ?? []) {
    const attempt = (job.attempts ?? 0) + 1;
    const atts = Array.isArray(job.attachments) ? (job.attachments as Attachment[]) : [];
    const bytes = atts.length
      ? await loadAttachmentBytes(supabaseAdmin, atts)
      : ({ ok: true as const, attachments: [] as Array<{ filename: string; mimeType: string; contentBase64: string }> });


    if (!bytes.ok) {
      await supabaseAdmin
        .from("email_queue")
        .update({
          status: "failed",
          attempts: attempt,
          last_error: bytes.error,
          next_attempt_at: new Date(Date.now() + backoffSeconds(attempt) * 1000).toISOString(),
        })
        .eq("id", job.id);
      results.push({ id: job.id, ok: false, error: bytes.error });
      continue;
    }

    const intendedTo = job.to_email_intended ?? job.to_email;
    const actualTo = applyOverride ? overrideRecipient : intendedTo;
    const subject = applyOverride ? `[DEV → ${intendedTo}] ${job.subject}` : job.subject;

    const res = await provider.send({
      from: { name: settings.sender_name, email: settings.sender_email ?? "" },
      to: actualTo,
      replyTo: settings.reply_to,
      subject,
      html: job.html,
      text: job.text_body,
      attachments: bytes.attachments,
    });


    const now2 = new Date().toISOString();
    if (res.ok) {
      // Gmail (and other synchronous SMTP-style providers) accept = deliver.
      // Async webhook providers update delivered_at via
      // /webhooks/email/$provider; providers without delivery webhooks get an
      // immediate delivered_at so dashboards reflect reality.
      const providerHasWebhook = ["resend", "sendgrid", "postmark", "mailgun"].includes(
        res.provider,
      );
      const deliveredAt = providerHasWebhook ? null : now2;

      await supabaseAdmin
        .from("email_queue")
        .update({
          status: "sent",
          attempts: attempt,
          sent_at: now2,
          delivered_at: deliveredAt,
          provider: res.provider,
          provider_status: providerHasWebhook ? "accepted" : "delivered",
          provider_message_id: res.messageId ?? null,
          to_email: actualTo,
          to_email_intended: intendedTo,
          last_error: null,
          last_event_at: now2,
        })
        .eq("id", job.id);
      if (job.feedback_id) {
        await supabaseAdmin
          .from("feedback")
          .update({
            status: job.kind === "reminder" ? undefined : "sent",
            sent_at: now2,
            ...(deliveredAt ? { delivered_at: deliveredAt } : {}),
            email_error: null,
            ...(job.kind === "reminder"
              ? {
                  last_reminder_at: now2,
                  escalated_at: null,
                }
              : {}),
          })
          .eq("id", job.feedback_id);
        const events: Array<{ feedback_id: string; event_type: string; detail: any }> = [
          {
            feedback_id: job.feedback_id,
            event_type: job.kind === "reminder" ? "reminder_sent" : "sent",
            detail: {
              provider: res.provider,
              message_id: res.messageId ?? null,
              queue_id: job.id,
              intended_to: intendedTo,
              actual_to: actualTo,
              dev_override: applyOverride,
            },
          },
        ];
        if (!providerHasWebhook) {
          events.push({
            feedback_id: job.feedback_id,
            event_type: "delivered",
            detail: {
              provider: res.provider,
              message_id: res.messageId ?? null,
              queue_id: job.id,
              inferred: true,
              reason: "synchronous_smtp_accepted",
            },
          });
        }
        await supabaseAdmin.from("feedback_email_events").insert(events);
        await supabaseAdmin.from("feedback_audit_log").insert({
          feedback_id: job.feedback_id,
          actor_id: null,
          action: providerHasWebhook ? "email_accepted" : "email_delivered",
          comment: `Provider ${res.provider} ${providerHasWebhook ? "accepted" : "delivered"} message ${res.messageId ?? ""}`.trim(),
          metadata: {
            source: "email_queue",
            provider: res.provider,
            message_id: res.messageId ?? null,
            queue_id: job.id,
            intended_to: intendedTo,
            actual_to: actualTo,
            dev_override: applyOverride,
          },
        });
      }

      results.push({
        id: job.id,
        ok: true,
        messageId: res.messageId ?? null,
        intendedTo,
        actualTo,
        devOverride: applyOverride,
      });
    } else {
      const done = attempt >= (job.max_attempts ?? 5);
      await supabaseAdmin
        .from("email_queue")
        .update({
          status: done ? "failed" : "queued",
          attempts: attempt,
          last_error: res.error,
          provider: res.provider,
          next_attempt_at: new Date(Date.now() + backoffSeconds(attempt) * 1000).toISOString(),
        })
        .eq("id", job.id);
      if (job.feedback_id) {
        await supabaseAdmin
          .from("feedback")
          .update({ email_error: res.error })
          .eq("id", job.feedback_id);
        await supabaseAdmin.from("feedback_email_events").insert({
          feedback_id: job.feedback_id,
          event_type: done ? "send_failed" : "send_retry",
          detail: { attempt, error: res.error, queue_id: job.id },
        });
      }
      results.push({ id: job.id, ok: false, error: res.error, willRetry: !done });
    }
  }

  return { processed: results.length, results };
}
