import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";
import { renderFeedbackEmail, type FeedbackEmailAttachmentLink } from "./feedback-email.templates";
import { buildVariableMap, renderCustomTemplate } from "./feedback-email.variables";
import qualipulseMark from "@/assets/qualipulse-mark.png.asset.json";

const STAFF_ROLES = ["qa_admin", "qa_manager", "qa_reviewer"] as const;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function fail(message: string, status: number, err?: unknown): never {
  if (err) console.error(`[feedback-email] ${message}`, err);
  throw new Response(message, { status });
}

function getAppBaseUrl(): string {
  const envUrl = process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  try {
    const host = getRequestHost();
    if (host) return `https://${host}`;
  } catch {}
  return "https://app.example.com";
}

// Kept for reference — the review workflow has been retired, so we no longer
// gate feedback sends behind qa_* roles. RLS still enforces who can read/write
// the underlying feedback row.
async function assertStaff(_supabase: unknown, _userId: string) {
  return;
}

// Load per-parameter scores in canonical order for the email body.
async function loadMetrics(supabase: any, feedbackId: string) {
  const { data } = await supabase
    .from("feedback_scores")
    .select("parameter_name, selected_percentage, display_order")
    .eq("feedback_id", feedbackId)
    .order("display_order", { ascending: true });
  return (data ?? [])
    .filter((r: any) => r.selected_percentage != null)
    .map((r: any) => ({ label: r.parameter_name as string, score: Number(r.selected_percentage) }));
}


// Enqueue a feedback email. The background drainer sends it and updates
// feedback.status = "sent" once the provider accepts it.
export const sendFeedbackEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ feedbackId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaff(supabase, context.userId);

    const { data: fb, error } = await supabase
      .from("feedback")
      .select("*, agent:agents(*)")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (error) fail("Unable to load feedback", 500, error);
    if (!fb) throw new Response("Feedback not found", { status: 404 });
    if (!fb.agent?.email) throw new Response("Agent has no email on file", { status: 400 });
    if (!["draft", "ready_to_send", "failed"].includes(fb.status as string)) {
      throw new Response(
        `Cannot send from status "${fb.status}"`,
        { status: 409 },
      );
    }
    const sourceStatus = fb.status as string;


    const { data: settings, error: settingsErr } = await supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (settingsErr) fail("Unable to load email settings", 500, settingsErr);
    if (!settings) throw new Response("Email settings not configured", { status: 400 });
    if (!settings.enabled) throw new Response("Email service is disabled in Settings", { status: 400 });
    if (!settings.sender_email) {
      throw new Response("Configure a sender email in Settings first", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Signed URLs for attachments (30 days)
    const { data: atts, error: attErr } = await supabaseAdmin
      .from("feedback_attachments")
      .select("*")
      .eq("feedback_id", fb.id);
    if (attErr) fail("Unable to load attachments", 500, attErr);

    const attachmentLinks: FeedbackEmailAttachmentLink[] = [];
    const queueAttachments: any[] = [];
    for (const a of atts ?? []) {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("feedback-attachments")
        .createSignedUrl(a.storage_path, SIGNED_URL_TTL_SECONDS);
      if (signErr) {
        console.error("[feedback-email] signed URL failed", { path: a.storage_path, err: signErr });
        continue;
      }
      if (signed?.signedUrl) attachmentLinks.push({ fileName: a.file_name, url: signed.signedUrl });
      queueAttachments.push({
        storage_path: a.storage_path,
        file_name: a.file_name,
        mime_type: a.mime_type,
      });
    }

    const appBaseUrl = getAppBaseUrl();
    const metrics = await loadMetrics(supabase, fb.id);
    const defaults = renderFeedbackEmail({
      feedbackId: fb.id,
      title: fb.title,
      agentName: fb.agent.full_name,
      managerName: fb.agent.manager_name ?? undefined,
      category: fb.category,
      feedbackType: fb.feedback_type,
      severity: fb.severity,
      interactionType: (fb as any).interaction_type,
      score: fb.score as number | null,
      summary: fb.summary,
      strengths: fb.strengths,
      improvements: fb.improvements,
      recommendedActions: fb.recommended_actions,
      dueDate: fb.due_date,
      appBaseUrl,
      senderName: settings.sender_name,
      logoUrl: settings.logo_url ?? `${appBaseUrl}${qualipulseMark.url}`,
      signatureHtml: settings.signature_html,
      confidentialityNotice: settings.confidentiality_notice,
      attachmentLinks,
      metrics,
    });

    let subject = defaults.subject;
    let html = defaults.html;
    let text = defaults.text;

    if (
      settings.feedback_template_enabled &&
      settings.feedback_template_subject &&
      settings.feedback_template_html
    ) {
      const vars = buildVariableMap({
        feedbackId: fb.id,
        title: fb.title,
        agentName: fb.agent.full_name,
        managerName: fb.agent.manager_name ?? undefined,
        category: fb.category,
        feedbackType: fb.feedback_type,
        severity: fb.severity,
        score: fb.score as number | null,
        summary: fb.summary,
        strengths: fb.strengths,
        improvements: fb.improvements,
        recommendedActions: fb.recommended_actions,
        dueDate: fb.due_date,
        appBaseUrl,
        senderName: settings.sender_name,
      });
      const rendered = renderCustomTemplate(
        {
          subject: settings.feedback_template_subject,
          html: settings.feedback_template_html,
          text: settings.feedback_template_text,
        },
        vars,
      );
      subject = rendered.subject || subject;
      html = rendered.html || html;
      text = rendered.text || text;
    }

    // Recipient sanity check — never let bad addresses through to the provider.
    const recipient = String(fb.agent.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      throw new Response(`Agent email "${recipient}" is not a valid address`, { status: 400 });
    }

    // Optimistic status transition: {draft|ready_to_send|failed} → ready_to_send.
    // The drainer flips ready_to_send → sent once the provider accepts.
    const nowIso = new Date().toISOString();
    const { data: transitioned, error: txErr } = await supabaseAdmin
      .from("feedback")
      .update({ status: "ready_to_send", sent_at: null, email_error: null })
      .eq("id", fb.id)
      .eq("status", sourceStatus as never)
      .select("id")
      .maybeSingle();
    if (txErr) fail("Unable to update feedback status", 500, txErr);
    if (!transitioned) {
      throw new Response("Feedback was updated by someone else — refresh and retry", { status: 409 });
    }

    const { data: job, error: qErr } = await supabaseAdmin
      .from("email_queue")
      .insert({
        feedback_id: fb.id,
        kind: "feedback",
        to_email: recipient,
        to_name: fb.agent.full_name,
        subject,
        html,
        text_body: text,
        attachments: queueAttachments,
        priority: 3,
        status: "queued",
        max_attempts: 5,
        next_attempt_at: nowIso,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (qErr || !job) {
      // Rollback the status transition so the user can retry.
      await supabaseAdmin
        .from("feedback")
        .update({ status: sourceStatus as never, sent_at: null })
        .eq("id", fb.id)
        .eq("status", "ready_to_send");
      fail("Unable to enqueue email", 500, qErr);
    }


    await supabaseAdmin.from("feedback_email_events").insert({
      feedback_id: fb.id,
      event_type: "queued",
      detail: { queue_id: job.id, provider: settings.provider, to: recipient },
    });

    // Drain synchronously so the response reflects the real provider outcome.
    let providerAccepted = false;
    let providerError: string | null = null;
    let providerMessageId: string | null = null;
    let actualRecipient: string = recipient;
    let devOverride = false;
    try {
      const { drainQueue } = await import("@/lib/email-queue.server");
      const drain = await drainQueue();
      const result = (drain.results ?? []).find((r: any) => r?.id === job.id);
      if (result?.ok) {
        providerAccepted = true;
        providerMessageId = result.messageId ?? null;
        actualRecipient = result.actualTo ?? recipient;
        devOverride = !!result.devOverride;
      } else if (result) {
        providerError = String(result.error ?? "Send failed");
      }
    } catch (drainErr) {
      providerError = (drainErr as Error).message;
      console.error("[feedback-email] immediate drain failed", drainErr);
    }

    if (providerAccepted) {
      // Drainer already set feedback.status = "sent" and stamped sent_at.
      return {
        ok: true as const,
        queueId: job.id,
        providerMessageId,
        recipient,
        actualRecipient,
        devOverride,
      };
    }

    // Not accepted synchronously — leave in queue for background retries but
    // surface the state honestly instead of falsely claiming "Sent".
    return {
      ok: false as const,
      queued: true as const,
      queueId: job.id,
      recipient,
      error: providerError,
    };
  });

// Render the feedback email as HTML for in-app preview. No side effects.
export const previewFeedbackEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ feedbackId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaff(supabase, context.userId);

    const { data: fb, error } = await supabase
      .from("feedback")
      .select("*, agent:agents(*)")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (error) fail("Unable to load feedback", 500, error);
    if (!fb) throw new Response("Feedback not found", { status: 404 });

    const { data: settings } = await supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();

    const appBaseUrl = getAppBaseUrl();
    const metrics = await loadMetrics(supabase, fb.id);
    const rendered = renderFeedbackEmail({
      feedbackId: fb.id,
      title: fb.title,
      agentName: fb.agent?.full_name ?? "Agent",
      managerName: fb.agent?.manager_name ?? undefined,
      category: fb.category,
      feedbackType: fb.feedback_type,
      severity: fb.severity,
      interactionType: (fb as any).interaction_type,
      score: fb.score as number | null,
      summary: fb.summary,
      strengths: fb.strengths,
      improvements: fb.improvements,
      recommendedActions: fb.recommended_actions,
      dueDate: fb.due_date,
      appBaseUrl,
      senderName: settings?.sender_name,
      logoUrl: settings?.logo_url ?? `${appBaseUrl}${qualipulseMark.url}`,
      signatureHtml: settings?.signature_html,
      confidentialityNotice: settings?.confidentiality_notice,
      metrics,
    });
    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      recipient: fb.agent?.email ?? null,
      provider: {
        id: (settings?.provider ?? "gmail") as string,
        senderEmail: settings?.sender_email ?? null,
        replyTo: settings?.reply_to ?? null,
        // The current MIME builder in providers.server.ts does not emit
        // List-Unsubscribe headers — surface that honestly to the analyzer.
        hasListUnsubscribe: false,
        hasOneClickUnsubscribe: false,
        isBulk: false,
      },
    };
  });

// Send the rendered feedback email to a chosen recipient WITHOUT changing
// feedback state or writing to the queue. Returns the real provider response
// (message id + latency, or provider error) so staff can dry-run before send.
export const sendFeedbackTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        feedbackId: z.string().uuid(),
        to: z.string().trim().email().max(255),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertStaff(supabase, context.userId);

    const { data: fb, error } = await supabase
      .from("feedback")
      .select("*, agent:agents(*)")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (error) fail("Unable to load feedback", 500, error);
    if (!fb) throw new Response("Feedback not found", { status: 404 });

    const { data: settings, error: sErr } = await supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (sErr) fail("Unable to load email settings", 500, sErr);
    if (!settings) throw new Response("Email settings not configured", { status: 400 });
    if (!settings.enabled) throw new Response("Email service is disabled in Settings", { status: 400 });
    if (!settings.sender_email) {
      throw new Response("Configure a sender email in Settings first", { status: 400 });
    }

    const appBaseUrl = getAppBaseUrl();
    const rendered = renderFeedbackEmail({
      feedbackId: fb.id,
      title: fb.title,
      agentName: fb.agent?.full_name ?? "Agent",
      managerName: fb.agent?.manager_name ?? undefined,
      category: fb.category,
      feedbackType: fb.feedback_type,
      severity: fb.severity,
      score: fb.score as number | null,
      summary: fb.summary,
      strengths: fb.strengths,
      improvements: fb.improvements,
      recommendedActions: fb.recommended_actions,
      dueDate: fb.due_date,
      appBaseUrl,
      senderName: settings.sender_name,
      logoUrl: settings.logo_url ?? `${appBaseUrl}${qualipulseMark.url}`,
      signatureHtml: settings.signature_html,
      confidentialityNotice: settings.confidentiality_notice,
    });

    const { getProvider } = await import("@/lib/email/providers.server");
    const provider = getProvider(settings.provider);
    const started = Date.now();
    try {
      const res = await provider.send({
        from: { name: settings.sender_name ?? "", email: settings.sender_email },
        to: data.to,
        replyTo: settings.reply_to ?? undefined,
        subject: `[TEST] ${rendered.subject}`,
        text: rendered.text,
        html: rendered.html,
      });
      return {
        ...res,
        provider: provider.displayName,
        recipient: data.to,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      return {
        ok: false as const,
        provider: provider.displayName,
        recipient: data.to,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message.slice(0, 300) : "Test send failed",
      };
    }
  });
