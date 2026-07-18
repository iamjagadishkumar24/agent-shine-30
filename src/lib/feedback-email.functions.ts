import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";
import { renderFeedbackEmail, type FeedbackEmailAttachmentLink } from "./feedback-email.templates";

function getAppBaseUrl(): string {
  const envUrl = process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  try {
    const host = getRequestHost();
    if (host) return `https://${host}`;
  } catch {}
  return "https://app.example.com";
}

// Enqueue a feedback email. The background drainer sends it and updates
// feedback.status = "sent" once the provider accepts it.
export const sendFeedbackEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { feedbackId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: fb, error } = await supabase
      .from("feedback")
      .select("*, agent:agents(*)")
      .eq("id", data.feedbackId)
      .single();
    if (error || !fb) throw new Error(error?.message || "Feedback not found");
    if (!fb.agent?.email) throw new Error("Agent has no email on file");

    const { data: settings } = await supabase.from("email_settings").select("*").eq("singleton", true).maybeSingle();
    if (!settings) throw new Error("Email settings not configured");
    if (!settings.enabled) throw new Error("Email service is disabled in Settings");
    if (!settings.sender_email) throw new Error("Configure a sender email in Settings first");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Signed URLs for attachments (30 days)
    const { data: atts } = await supabaseAdmin
      .from("feedback_attachments")
      .select("*")
      .eq("feedback_id", fb.id);

    const attachmentLinks: FeedbackEmailAttachmentLink[] = [];
    const queueAttachments: any[] = [];
    for (const a of atts ?? []) {
      const { data: signed } = await supabaseAdmin.storage
        .from("feedback-attachments")
        .createSignedUrl(a.storage_path, 60 * 60 * 24 * 30);
      if (signed?.signedUrl) attachmentLinks.push({ fileName: a.file_name, url: signed.signedUrl });
      queueAttachments.push({
        storage_path: a.storage_path,
        file_name: a.file_name,
        mime_type: a.mime_type,
      });
    }

    const appBaseUrl = getAppBaseUrl();
    const { subject, html, text } = renderFeedbackEmail({
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
      logoUrl: settings.logo_url,
      signatureHtml: settings.signature_html,
      confidentialityNotice: settings.confidentiality_notice,
      attachmentLinks,
    });

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
        next_attempt_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (qErr) throw new Error(qErr.message);

    await supabaseAdmin
      .from("feedback")
      .update({ status: "sent", sent_at: new Date().toISOString(), email_error: null })
      .eq("id", fb.id);

    await supabaseAdmin.from("feedback_email_events").insert({
      feedback_id: fb.id,
      event_type: "queued",
      detail: { queue_id: job.id, provider: settings.provider },
    });

    // Trigger a drain immediately so the user doesn't wait a minute
    try {
      const { drainQueue } = await import("@/lib/email-queue.server");
      await drainQueue();
    } catch {}

    return { ok: true as const, queueId: job.id };
  });
