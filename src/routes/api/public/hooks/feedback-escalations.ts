import { createFileRoute } from "@tanstack/react-router";
import { renderFeedbackEmail } from "@/lib/feedback-email.templates";

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
        const { sendTransactionalEmail } = await import("@/lib/feedback-email.server");

        const now = Date.now();
        const slaCutoff = new Date(now - SLA_HOURS * 3600_000).toISOString();
        const reminderCutoff = new Date(now - REMINDER_INTERVAL_HOURS * 3600_000).toISOString();

        // Sent feedback not yet acknowledged, past SLA, under reminder cap, and last reminder older than interval
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
        const processed: { id: string; ok: boolean; error?: string }[] = [];

        for (const fb of rows ?? []) {
          if (!fb.agent?.email) {
            processed.push({ id: fb.id, ok: false, error: "no agent email" });
            continue;
          }
          const nextCount = (fb.reminder_count ?? 0) + 1;
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
            isReminder: true,
            reminderCount: nextCount,
          });

          const result = await sendTransactionalEmail({
            to: fb.agent.email,
            subject,
            html,
            text,
            fromName: "QA Feedback",
          });

          const nowIso = new Date().toISOString();
          await supabaseAdmin
            .from("feedback")
            .update({
              reminder_count: nextCount,
              last_reminder_at: nowIso,
              escalated_at: fb.escalated_at ?? nowIso,
              email_error: result.ok ? null : result.error,
            })
            .eq("id", fb.id);

          await supabaseAdmin.from("feedback_email_events").insert({
            feedback_id: fb.id,
            event_type: result.ok ? "reminder_sent" : "reminder_failed",
            detail: {
              reminder_count: nextCount,
              provider: result.provider,
              ...(result.ok ? { message_id: result.messageId ?? null } : { error: result.error }),
            },
          });

          processed.push({ id: fb.id, ok: result.ok, error: result.ok ? undefined : result.error });
        }

        return Response.json({ processed: processed.length, results: processed });
      },
    },
  },
});
