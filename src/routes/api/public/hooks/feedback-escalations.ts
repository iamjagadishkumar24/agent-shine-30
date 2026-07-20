import { createFileRoute } from "@tanstack/react-router";
import { renderFeedbackEmail } from "@/lib/feedback-email.templates";
import qualipulseMark from "@/assets/qualipulse-mark.png.asset.json";

const SLA_HOURS = 48;
const MAX_REMINDERS = 3;
const REMINDER_INTERVAL_HOURS = 24;

export const Route = createFileRoute("/api/public/hooks/feedback-escalations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const now = Date.now();
        const slaCutoff = new Date(now - SLA_HOURS * 3600_000).toISOString();
        const reminderCutoff = new Date(now - REMINDER_INTERVAL_HOURS * 3600_000).toISOString();

        const { data: settings } = await supabaseAdmin
          .from("email_settings")
          .select("*")
          .eq("singleton", true)
          .maybeSingle();
        if (!settings || !settings.enabled) {
          return Response.json({ processed: 0, skipped: "email service disabled" });
        }

        const { data: rows, error } = await supabaseAdmin
          .from("feedback")
          .select("*, agent:agents(*)")
          .eq("status", "sent")
          .lt("sent_at", slaCutoff)
          .lt("reminder_count", MAX_REMINDERS)
          .or(`last_reminder_at.is.null,last_reminder_at.lt.${reminderCutoff}`)
          .limit(50);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const appBaseUrl = (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
        const processed: { id: string; queued: boolean }[] = [];

        for (const fb of rows ?? []) {
          if (!fb.agent?.email) {
            processed.push({ id: fb.id, queued: false });
            continue;
          }
          const nextCount = (fb.reminder_count ?? 0) + 1;

          const { data: atts } = await supabaseAdmin
            .from("feedback_attachments")
            .select("*")
            .eq("feedback_id", fb.id);
          const attachmentLinks: { fileName: string; url: string }[] = [];
          const queueAttachments: any[] = [];
          for (const a of atts ?? []) {
            const { data: signed } = await supabaseAdmin.storage
              .from("feedback-attachments")
              .createSignedUrl(a.storage_path, 60 * 60 * 24 * 30);
            if (signed?.signedUrl) attachmentLinks.push({ fileName: a.file_name, url: signed.signedUrl });
            queueAttachments.push({ storage_path: a.storage_path, file_name: a.file_name, mime_type: a.mime_type });
          }

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
            isReminder: true,
            reminderCount: nextCount,
            senderName: settings.sender_name,
            logoUrl: settings.logo_url ?? `${appBaseUrl}${qualipulseMark.url}`,
            signatureHtml: settings.signature_html,
            confidentialityNotice: settings.confidentiality_notice,
            attachmentLinks,
          });

          await supabaseAdmin.from("email_queue").insert({
            feedback_id: fb.id,
            kind: "reminder",
            to_email: fb.agent.email,
            to_name: fb.agent.full_name,
            subject,
            html,
            text_body: text,
            attachments: queueAttachments,
            priority: 2,
            status: "queued",
            max_attempts: 5,
            next_attempt_at: new Date().toISOString(),
          });

          const nowIso = new Date().toISOString();
          await supabaseAdmin
            .from("feedback")
            .update({
              reminder_count: nextCount,
              last_reminder_at: nowIso,
              escalated_at: fb.escalated_at ?? nowIso,
            })
            .eq("id", fb.id);

          await supabaseAdmin.from("feedback_email_events").insert({
            feedback_id: fb.id,
            event_type: "reminder_queued",
            detail: { reminder_count: nextCount },
          });

          processed.push({ id: fb.id, queued: true });
        }

        return Response.json({ processed: processed.length, results: processed });
      },
    },
  },
});
