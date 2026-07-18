import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHost } from "@tanstack/react-start/server";
import { renderFeedbackEmail } from "./feedback-email.templates";

function getAppBaseUrl(): string {
  const envUrl = process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  try {
    const host = getRequestHost();
    if (host) return `https://${host}`;
  } catch {}
  return "https://app.example.com";
}

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

    const appBaseUrl = getAppBaseUrl();
    const { subject, html, text } = renderFeedbackEmail({
      feedbackId: fb.id,
      title: fb.title,
      agentName: fb.agent.full_name,
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
    });

    const { sendTransactionalEmail } = await import("./feedback-email.server");
    const result = await sendTransactionalEmail({
      to: fb.agent.email,
      subject,
      html,
      text,
      fromName: "QA Feedback",
    });

    const nowIso = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (result.ok) {
      await supabaseAdmin
        .from("feedback")
        .update({
          status: "sent",
          sent_at: nowIso,
          delivered_at: nowIso,
          email_error: null,
        })
        .eq("id", fb.id);
      await supabaseAdmin.from("feedback_email_events").insert({
        feedback_id: fb.id,
        event_type: "sent",
        detail: { provider: result.provider, message_id: result.messageId ?? null },
      });
      return { ok: true as const, provider: result.provider };
    } else {
      await supabaseAdmin
        .from("feedback")
        .update({
          status: "sent",
          sent_at: nowIso,
          email_error: result.error,
        })
        .eq("id", fb.id);
      await supabaseAdmin.from("feedback_email_events").insert({
        feedback_id: fb.id,
        event_type: "send_failed",
        detail: { provider: result.provider, error: result.error },
      });
      return { ok: false as const, error: result.error };
    }
  });
