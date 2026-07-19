import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";
import { renderFeedbackEmail, type FeedbackEmailAttachmentLink } from "./feedback-email.templates";
import { buildVariableMap, renderCustomTemplate } from "./feedback-email.variables";
import zenworkLogo from "@/assets/zenwork-logo.png.asset.json";

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

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) fail("Unable to verify permissions", 500, error);
  const roles = new Set((data ?? []).map((r: any) => r.role));
  if (!STAFF_ROLES.some((r) => roles.has(r))) {
    throw new Response("Staff role required", { status: 403 });
  }
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
    if (fb.status !== "approved") {
      throw new Response(
        `Cannot send from status "${fb.status}" — feedback must be approved first`,
        { status: 409 },
      );
    }

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
    const defaults = renderFeedbackEmail({
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
      logoUrl: settings.logo_url ?? `${appBaseUrl}${zenworkLogo.url}`,
      signatureHtml: settings.signature_html,
      confidentialityNotice: settings.confidentiality_notice,
      attachmentLinks,
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

    // Optimistic status transition: approved → sent. If another sender won the
    // race, the update matches 0 rows and we bail out instead of double-queueing.
    const nowIso = new Date().toISOString();
    const { data: transitioned, error: txErr } = await supabaseAdmin
      .from("feedback")
      .update({ status: "sent", sent_at: nowIso, email_error: null })
      .eq("id", fb.id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();
    if (txErr) fail("Unable to update feedback status", 500, txErr);
    if (!transitioned) {
      throw new Response("Feedback already sent by another reviewer", { status: 409 });
    }

    const { data: job, error: qErr } = await supabaseAdmin
      .from("email_queue")
      .insert({
        feedback_id: fb.id,
        kind: "feedback",
        to_email: fb.agent.email,
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
        .update({ status: "approved", sent_at: null })
        .eq("id", fb.id)
        .eq("status", "sent");
      fail("Unable to enqueue email", 500, qErr);
    }

    await supabaseAdmin.from("feedback_email_events").insert({
      feedback_id: fb.id,
      event_type: "queued",
      detail: { queue_id: job.id, provider: settings.provider },
    });

    // Trigger a drain immediately so the user doesn't wait a minute
    try {
      const { drainQueue } = await import("@/lib/email-queue.server");
      await drainQueue();
    } catch (drainErr) {
      console.error("[feedback-email] immediate drain failed", drainErr);
    }

    return { ok: true as const, queueId: job.id };
  });
