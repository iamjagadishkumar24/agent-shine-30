import { createFileRoute } from "@tanstack/react-router";
import { renderFeedbackEmail } from "@/lib/feedback-email.templates";
import qualipulseMark from "@/assets/qualipulse-mark.png.asset.json";

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

        const { data: settings } = await supabaseAdmin
          .from("email_settings")
          .select("*")
          .eq("singleton", true)
          .maybeSingle();
        if (!settings || !settings.enabled) {
          return Response.json({ processed: 0, skipped: "email service disabled" });
        }

        const firstDays = Number((settings as any).first_reminder_after_days ?? 2) || 2;
        const secondDays = Number((settings as any).second_reminder_after_days ?? 5) || 5;
        const overdueDays = Number((settings as any).overdue_after_days ?? 7) || 7;
        const maxReminders = Number((settings as any).max_reminders ?? 3) || 3;

        const now = Date.now();
        // pick rows where next reminder is due based on their reminder_count
        const scanCutoff = new Date(now - firstDays * 86_400_000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("feedback")
          .select("*, agent:agents(*)")
          .eq("status", "sent")
          .is("acknowledged_at", null)
          .is("agent_response_received_at", null)
          .lt("sent_at", scanCutoff)
          .lt("reminder_count", maxReminders)
          .limit(50);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const appBaseUrl = (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
        const replyTo = settings.reply_to ?? "itsjack2025@gmail.com";
        const processed: { id: string; queued: boolean; skipped?: string }[] = [];

        for (const fb of rows ?? []) {
          if (!fb.agent?.email) {
            processed.push({ id: fb.id, queued: false, skipped: "no agent email" });
            continue;
          }
          const nextCount = (fb.reminder_count ?? 0) + 1;
          const sentAt = fb.sent_at ? new Date(fb.sent_at).getTime() : now;
          const lastAt = fb.last_reminder_sent_at ? new Date(fb.last_reminder_sent_at).getTime() : sentAt;
          // Interval gating: 1st reminder after firstDays since send, 2nd after secondDays since 1st, etc.
          const intervalDays = nextCount === 1 ? firstDays : nextCount === 2 ? Math.max(1, secondDays - firstDays) : Math.max(1, secondDays);
          if (now - lastAt < intervalDays * 86_400_000) {
            processed.push({ id: fb.id, queued: false, skipped: "interval not elapsed" });
            continue;
          }

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

          const { data: scoreRows } = await supabaseAdmin
            .from("feedback_scores")
            .select("parameter_name, max_points, selected_percentage, earned_points, evaluator_note, display_order")
            .eq("feedback_id", fb.id)
            .order("display_order", { ascending: true });
          const metrics = (scoreRows ?? []).map((r: any) => ({
            label: r.parameter_name as string,
            score: Number(r.selected_percentage ?? 0),
            maxPoints: Number(r.max_points ?? 0),
            earnedPoints: Number(r.earned_points ?? 0),
            note: r.evaluator_note ?? null,
          }));

          let teamName: string | null = null;
          let evaluatorName: string | null = null;
          if (fb.team_id) {
            const { data } = await supabaseAdmin.from("teams").select("name").eq("id", fb.team_id).maybeSingle();
            teamName = data?.name ?? null;
          }
          const evalUser = (fb as any).evaluator_id || fb.created_by;
          if (evalUser) {
            const { data } = await supabaseAdmin.from("profiles").select("full_name").eq("id", evalUser).maybeSingle();
            evaluatorName = data?.full_name ?? null;
          }

          const { subject, html, text } = renderFeedbackEmail({
            feedbackId: fb.id,
            caseNumber: (fb as any).case_number ?? null,
            title: fb.title,
            agentName: fb.agent.full_name,
            teamName,
            evaluatorName,
            managerName: fb.agent.manager_name ?? undefined,
            category: fb.category,
            feedbackType: fb.feedback_type,
            severity: fb.severity,
            interactionType: (fb as any).interaction_type,
            interactionReference: (fb as any).interaction_reference ?? null,
            interactionDate: (fb as any).interaction_date ?? null,
            score: fb.score as number | null,
            summary: fb.summary,
            strengths: fb.strengths,
            improvements: fb.improvements,
            recommendedActions: fb.recommended_actions,
            dueDate: fb.due_date,
            acknowledgementDueAt: (fb as any).acknowledgement_due_at ?? null,
            appBaseUrl,
            isReminder: true,
            reminderCount: nextCount,
            senderName: settings.sender_name,
            logoUrl: settings.logo_url ?? `${appBaseUrl}${qualipulseMark.url}`,
            signatureHtml: settings.signature_html,
            confidentialityNotice: settings.confidentiality_notice,
            attachmentLinks,
            metrics,
            replyToEmail: replyTo,
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

          await supabaseAdmin.from("feedback_reminders").insert({
            feedback_id: fb.id,
            reminder_number: nextCount,
            recipient_email: fb.agent.email,
            subject,
            delivery_status: "queued",
            sent_at: new Date().toISOString(),
          });

          const nowIso = new Date().toISOString();
          const isOverdue = (now - sentAt) / 86_400_000 >= overdueDays;
          const patch: Record<string, unknown> = {
            reminder_count: nextCount,
            last_reminder_at: nowIso,
            last_reminder_sent_at: nowIso,
            escalated_at: fb.escalated_at ?? nowIso,
          };
          if (isOverdue) patch.acknowledgement_status = "overdue";
          await supabaseAdmin.from("feedback").update(patch).eq("id", fb.id);

          await supabaseAdmin.from("feedback_email_events").insert({
            feedback_id: fb.id,
            event_type: "reminder_queued",
            detail: { reminder_count: nextCount, overdue: isOverdue },
          });

          processed.push({ id: fb.id, queued: true });
        }

        return Response.json({ processed: processed.length, results: processed });
      },
    },
  },
});
